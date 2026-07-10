const axios = require('axios');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Settings = require('../models/Settings');
const Usage = require('../models/Usage');
const logger = require('../services/logger');
const openaiService = require('../services/openai');
const { escapeMarkdownV2 } = require('./commands');

/**
 * Helper: bold text for MarkdownV2
 */
const bold = (text) => '*' + escapeMarkdownV2(text) + '*';

/**
 * Helper: escape text (shorthand)
 */
const esc = (text) => escapeMarkdownV2(text || '');

/**
 * Safe send: tries MarkdownV2 first, falls back to plain text on parse error.
 * Logs the full Telegram error on failure.
 */
const sendSafe = async (bot, chatId, text, options = {}) => {
  try {
    await bot.sendMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
    });
  } catch (error) {
    logger.error('Telegram sendMessage error:', error.message);
    logger.error('Telegram error code:', error.code);
    logger.error('Telegram error stack:', error.stack);
    logger.error('Failed message preview:', text.substring(0, 300));
    // Fallback: strip all formatting, send as plain text
    try {
      const plainText = text.replace(/[*_~`[\]()]/g, '');
      await bot.sendMessage(chatId, plainText);
    } catch (fallbackError) {
      logger.error('Plain text fallback also failed:', fallbackError.message);
    }
  }
};

/**
 * Safe edit: tries MarkdownV2, falls back to plain text.
 */
const editSafe = async (bot, chatId, messageId, text, options = {}) => {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'MarkdownV2',
      ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
    });
  } catch (error) {
    logger.error('Telegram editMessageText error:', error.message);
    logger.error('Telegram error stack:', error.stack);
    try {
      const plainText = text.replace(/[*_~`[\]()]/g, '');
      await bot.editMessageText(plainText, {
        chat_id: chatId,
        message_id: messageId,
      });
    } catch (fallbackError) {
      logger.error('Plain text edit fallback failed:', fallbackError.message);
    }
  }
};

/**
 * Send typing action to show bot is working
 */
const sendTypingAction = async (bot, chatId) => {
  try {
    await bot.sendChatAction(chatId, 'typing');
  } catch {
    // Ignore typing errors
  }
};

/**
 * Handle incoming text messages (AI chat)
 */
const handleTextMessage = async (bot, msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const text = msg.text;
  const userData = msg.from;

  // Ignore commands
  if (text.startsWith('/')) return;

  try {
    // Start typing indicator
    await sendTypingAction(bot, chatId).catch(() => {});

    // Get or create user
    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({
        telegramId,
        username: userData.username || '',
        firstName: userData.first_name || 'User',
        lastName: userData.last_name || '',
        languageCode: userData.language_code || 'en',
      });

      await Settings.create({ userId: user._id, telegramId });
    } else {
      user.lastActiveAt = new Date();
      user.totalMessages += 1;
      await user.save();
    }

    // Check if banned
    if (user.banned) {
      const banMsg = '⛔ ' + esc('You have been banned from using this bot.') + '\n' +
        bold('Reason:') + ' ' + esc(user.banReason || 'Violated terms of service');
      await sendSafe(bot, chatId, banMsg);
      return;
    }

    // Get or create conversation
    let conversation = await Conversation.findOne({
      userId: user._id,
      isActive: true,
    }).sort({ lastMessageAt: -1 });

    if (!conversation) {
      conversation = await Conversation.create({
        userId: user._id,
        telegramId,
        title: text.substring(0, 100),
      });
    }

    // Save user message
    await Message.create({
      conversationId: conversation._id,
      userId: user._id,
      telegramId,
      role: 'user',
      content: text,
    });

    // Update conversation
    conversation.messageCount += 1;
    conversation.lastMessageAt = new Date();
    // Update title with first message
    if (conversation.messageCount === 1 && conversation.title === 'New Conversation') {
      conversation.title = text.substring(0, 100);
    }
    await conversation.save();

    // Get settings
    const settings = await Settings.findOne({ telegramId }) || {
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 2000,
      systemPrompt: 'You are AIX Nova, a helpful AI assistant.',
    };

    // Get conversation history (last 20 messages)
    const recentMessages = await Message.find({ conversationId: conversation._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const history = recentMessages.reverse();

    // Build messages for OpenAI
    const openaiMessages = openaiService.buildMessages(
      settings.systemPrompt,
      history.slice(0, -1),
      text
    );

    // Get AI response
    const startTime = Date.now();
    let response;
    try {
      response = await openaiService.generateResponse(openaiMessages, {
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
      });
    } catch (openaiError) {
      // OpenAI error — send user-friendly message, log full details to console
      const userMsg = openaiError.userMessage || '⚠️ AI service is temporarily unavailable. Please try again later.';
      await sendSafe(bot, chatId, '❌ ' + userMsg);
      return;
    }

    const responseTime = Date.now() - startTime;

    // Save AI response
    await Message.create({
      conversationId: conversation._id,
      userId: user._id,
      telegramId,
      role: 'assistant',
      content: response.content,
      tokens: response.usage,
      model: response.model,
    });

    // Update conversation
    conversation.totalTokens += response.usage.total;
    await conversation.save();

    // Update user tokens
    user.totalTokens += response.usage.total;
    await user.save();

    // Track usage
    await Usage.create({
      userId: user._id,
      telegramId,
      tokens: response.usage,
      messages: 1,
      responseTime,
    });

    logger.info(
      `Telegram AI: user=${telegramId} model=${response.model} tokens=${response.usage.total} time=${responseTime}ms`
    );

    // Send AI response — try MarkdownV2 first, HTML fallback, plain text last
    // This preserves code blocks, bold, italic from AI-generated markdown
    try {
      await bot.sendMessage(chatId, response.content, {
        parse_mode: 'MarkdownV2',
      });
    } catch (markdownError) {
      logger.error('AI response MarkdownV2 failed, trying HTML:', markdownError.message);
      logger.error('AI response preview:', response.content.substring(0, 200));
      try {
        // Try HTML if markdown fails
        const htmlContent = response.content
          .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
          .replace(/\*([^*]+)\*/g, '<i>$1</i>');

        await bot.sendMessage(chatId, htmlContent, {
          parse_mode: 'HTML',
        });
      } catch (htmlError) {
        logger.error('AI response HTML also failed, sending plain text:', htmlError.message);
        // Plain text fallback
        try {
          await bot.sendMessage(chatId, response.content.replace(/[*_~`#\[\]()]/g, ''));
        } catch (plainError) {
          logger.error('AI response plain text also failed:', plainError.message);
        }
      }
    }
  } catch (error) {
    // Only non-OpenAI errors reach here (DB errors, etc.)
    logger.error('Telegram message handler error:', error);
    logger.error('Telegram message handler stack:', error.stack);

    const errorMessage = '❌ ' + esc('An unexpected error occurred. Please try again later.');
    try {
      await bot.sendMessage(chatId, errorMessage);
    } catch (sendError) {
      logger.error('Failed to send error message to user:', sendError.message);
    }
  }
};

/**
 * Handle image messages
 */
const handleImageMessage = async (bot, msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const userData = msg.from;

  try {
    await sendTypingAction(bot, chatId).catch(() => {});

    // Get file info
    let fileId, caption;

    if (msg.photo) {
      // Get the largest photo
      const photo = msg.photo[msg.photo.length - 1];
      fileId = photo.file_id;
      caption = msg.caption || 'Describe this image in detail.';
    } else if (msg.document && msg.document.mime_type?.startsWith('image/')) {
      fileId = msg.document.file_id;
      caption = msg.caption || 'Describe this image in detail.';
    } else {
      return;
    }

    // Get file URL from Telegram
    const fileLink = await bot.getFileLink(fileId);

    // Get or create user
    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({
        telegramId,
        username: userData.username || '',
        firstName: userData.first_name || 'User',
        lastName: userData.last_name || '',
        languageCode: userData.language_code || 'en',
      });
      await Settings.create({ userId: user._id, telegramId });
    }

    // Analyze image
    let response;
    try {
      response = await openaiService.analyzeImage(fileLink, caption);
    } catch (openaiError) {
      const userMsg = openaiError.userMessage || '⚠️ AI service is temporarily unavailable. Please try again later.';
      await sendSafe(bot, chatId, '❌ ' + esc('Image analysis failed:') + ' ' + userMsg);
      return;
    }

    // Track usage
    await Usage.create({
      userId: user._id,
      telegramId,
      tokens: response.usage,
      messages: 1,
      images: 1,
      responseTime: response.responseTime,
    });

    user.totalMessages += 1;
    user.totalTokens += response.usage.total;
    await user.save();

    // Send AI response — try MarkdownV2, fallback to plain text
    try {
      await bot.sendMessage(chatId, response.content, {
        parse_mode: 'MarkdownV2',
      });
    } catch {
      logger.error('Image AI response MarkdownV2 failed, sending plain text');
      await bot.sendMessage(chatId, response.content);
    }

    logger.info(`Telegram image: user=${telegramId} tokens=${response.usage.total}`);
  } catch (error) {
    logger.error('Image handler error:', error);
    logger.error('Image handler stack:', error.stack);
    const errorMsg = '❌ ' + esc('Failed to analyze image. Please try again later.');
    await bot.sendMessage(chatId, errorMsg);
  }
};

/**
 * Handle document/file messages
 */
const handleDocumentMessage = async (bot, msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const userData = msg.from;

  try {
    await sendTypingAction(bot, chatId).catch(() => {});

    if (!msg.document) return;

    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name || 'unknown_file';
    const mimeType = msg.document.mime_type || '';
    const caption = msg.caption || 'Read and analyze this file.';

    // Get file URL from Telegram
    const fileLink = await bot.getFileLink(fileId);

    // Download file content
    const fileResponse = await axios.get(fileLink, { responseType: 'text' });
    const fileContent = fileResponse.data;

    // Get or create user
    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({
        telegramId,
        username: userData.username || '',
        firstName: userData.first_name || 'User',
        lastName: userData.last_name || '',
        languageCode: userData.language_code || 'en',
      });
      await Settings.create({ userId: user._id, telegramId });
    }

    // Analyze file
    let response;
    try {
      response = await openaiService.readFile(fileContent, fileName, caption);
    } catch (openaiError) {
      const userMsg = openaiError.userMessage || '⚠️ AI service is temporarily unavailable. Please try again later.';
      await sendSafe(bot, chatId, '❌ ' + esc('File analysis failed:') + ' ' + userMsg);
      return;
    }

    // Track usage
    await Usage.create({
      userId: user._id,
      telegramId,
      tokens: response.usage,
      messages: 1,
      files: 1,
      responseTime: response.responseTime,
    });

    user.totalMessages += 1;
    user.totalTokens += response.usage.total;
    await user.save();

    // Send response with file name header (escaped) + raw AI response (with markdown formatting)
    const fileHeader = '📄 ' + bold('File:') + ' ' + esc(fileName) + '\n\n';
    try {
      await bot.sendMessage(chatId, fileHeader + response.content, {
        parse_mode: 'MarkdownV2',
      });
    } catch {
      logger.error('File response MarkdownV2 failed, sending plain text');
      await bot.sendMessage(chatId, '📄 File: ' + fileName + '\n\n' + response.content);
    }

    logger.info(`Telegram file: user=${telegramId} file=${fileName} tokens=${response.usage.total}`);
  } catch (error) {
    logger.error('Document handler error:', error);
    logger.error('Document handler stack:', error.stack);

    if (error.code === 'ERR_FR_TOO_LARGE') {
      await bot.sendMessage(chatId, '❌ File is too large. Please send a smaller file (max 10MB).');
    } else {
      const errorMsg = '❌ ' + esc('Failed to analyze file. Please try again later.');
      await bot.sendMessage(chatId, errorMsg);
    }
  }
};

/**
 * Handle callback queries from inline keyboards
 */
const handleCallbackQuery = async (bot, callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const telegramId = callbackQuery.from.id;
  const data = callbackQuery.data;

  try {
    await bot.answerCallbackQuery(callbackQuery.id);

    if (data === 'settings_model') {
      const keyboard = {
        inline_keyboard: [
          [
            { text: 'GPT-4o', callback_data: 'set_model_gpt-4o' },
            { text: 'GPT-4o Mini', callback_data: 'set_model_gpt-4o-mini' },
          ],
          [
            { text: 'GPT-4 Turbo', callback_data: 'set_model_gpt-4-turbo' },
            { text: 'GPT-3.5 Turbo', callback_data: 'set_model_gpt-3.5-turbo' },
          ],
          [{ text: '⬅️ Back', callback_data: 'settings_back' }],
        ],
      };
      await editSafe(bot, chatId, callbackQuery.message.message_id, '🤖 ' + bold('Choose a model:'), {
        replyMarkup: keyboard,
      });
    } else if (data.startsWith('set_model_')) {
      const model = data.replace('set_model_', '');
      await Settings.findOneAndUpdate({ telegramId }, { model });
      await sendSafe(bot, chatId, '✅ ' + bold('Model set to:') + ' ' + esc(model));
    } else if (data === 'settings_temp') {
      const keyboard = {
        inline_keyboard: [
          [
            { text: '0.3 (Precise)', callback_data: 'set_temp_0.3' },
            { text: '0.7 (Balanced)', callback_data: 'set_temp_0.7' },
          ],
          [
            { text: '1.0 (Creative)', callback_data: 'set_temp_1.0' },
            { text: '1.5 (Very Creative)', callback_data: 'set_temp_1.5' },
          ],
          [{ text: '⬅️ Back', callback_data: 'settings_back' }],
        ],
      };
      const tempMsg = '🌡️ ' + bold('Choose temperature:') + '\n' +
        esc('0.0-0.3: Precise and focused') + '\n' +
        esc('0.4-0.7: Balanced') + '\n' +
        esc('0.8-1.0: Creative') + '\n' +
        esc('1.0-2.0: Very creative');
      await editSafe(bot, chatId, callbackQuery.message.message_id, tempMsg, {
        replyMarkup: keyboard,
      });
    } else if (data.startsWith('set_temp_')) {
      const temp = parseFloat(data.replace('set_temp_', ''));
      await Settings.findOneAndUpdate({ telegramId }, { temperature: temp });
      await sendSafe(bot, chatId, '✅ ' + bold('Temperature set to:') + ' ' + esc(String(temp)));
    } else if (data === 'settings_tokens') {
      const keyboard = {
        inline_keyboard: [
          [
            { text: '500', callback_data: 'set_tokens_500' },
            { text: '1000', callback_data: 'set_tokens_1000' },
            { text: '2000', callback_data: 'set_tokens_2000' },
          ],
          [
            { text: '4000', callback_data: 'set_tokens_4000' },
            { text: '8000', callback_data: 'set_tokens_8000' },
            { text: '16000', callback_data: 'set_tokens_16000' },
          ],
          [{ text: '⬅️ Back', callback_data: 'settings_back' }],
        ],
      };
      const tokensMsg = '📏 ' + bold('Choose max tokens:') + '\n' +
        esc('Controls response length') + '\n' +
        esc('Higher values allow longer responses') + '\n' +
        esc('Uses more tokens (cost)');
      await editSafe(bot, chatId, callbackQuery.message.message_id, tokensMsg, {
        replyMarkup: keyboard,
      });
    } else if (data.startsWith('set_tokens_')) {
      const tokens = parseInt(data.replace('set_tokens_', ''));
      await Settings.findOneAndUpdate({ telegramId }, { maxTokens: tokens });
      await sendSafe(bot, chatId, '✅ ' + bold('Max tokens set to:') + ' ' + esc(String(tokens)));
    } else if (data === 'settings_notifications') {
      const settings = await Settings.findOne({ telegramId });
      const newVal = !settings?.notifications;
      await Settings.findOneAndUpdate({ telegramId }, { notifications: newVal });
      await sendSafe(bot, chatId, '✅ ' + bold('Notifications:') + ' ' + esc(newVal ? 'Enabled' : 'Disabled'));
    } else if (data === 'settings_back') {
      const settings = await Settings.findOne({ telegramId });
      if (!settings) return;

      const msg = [
        '⚙️ ' + bold('Your Settings'),
        '',
        bold('Model:') + ' ' + esc(settings.model),
        bold('Temperature:') + ' ' + esc(String(settings.temperature)),
        bold('Max Tokens:') + ' ' + esc(String(settings.maxTokens)),
        bold('Language:') + ' ' + esc(settings.language),
        bold('Notifications:') + ' ' + (settings.notifications ? '✅' : '❌'),
      ].join('\n');

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🤖 Change Model', callback_data: 'settings_model' },
            { text: '🌡️ Temperature', callback_data: 'settings_temp' },
          ],
          [
            { text: '📏 Max Tokens', callback_data: 'settings_tokens' },
            { text: '🔔 Notifications', callback_data: 'settings_notifications' },
          ],
        ],
      };

      await editSafe(bot, chatId, callbackQuery.message.message_id, msg, {
        replyMarkup: keyboard,
      });
    }
  } catch (error) {
    logger.error('Callback query error:', error);
    logger.error('Callback query stack:', error.stack);
  }
};

/**
 * Register all bot message and callback handlers
 */
const registerHandlers = (bot) => {
  // Handle text messages (AI chat)
  bot.on('message', async (msg) => {
    // Skip if no text (handled by other handlers)
    if (!msg.text && !msg.photo && !msg.document) return;

    if (msg.text) {
      await handleTextMessage(bot, msg);
    }
  });

  // Handle photo messages
  bot.on('photo', async (msg) => {
    await handleImageMessage(bot, msg);
  });

  // Handle document/image files
  bot.on('document', async (msg) => {
    const mimeType = msg.document?.mime_type || '';
    if (mimeType.startsWith('image/')) {
      await handleImageMessage(bot, msg);
    } else if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/javascript' ||
      mimeType.includes('xml') ||
      msg.document?.file_name?.match(/\.(txt|js|ts|py|jsx|tsx|json|md|css|html|xml|yaml|yml|toml|ini|cfg|log|csv|sql|sh|bash|zsh|env|gitignore|dockerfile)$/i)
    ) {
      await handleDocumentMessage(bot, msg);
    } else {
      const chatId = msg.chat.id;
      await bot.sendMessage(chatId, '📎 Unsupported file type. Please send text-based files (txt, code, json, md, csv, etc.) or images.');
    }
  });

  // Handle callback queries (inline keyboard)
  bot.on('callback_query', async (callbackQuery) => {
    await handleCallbackQuery(bot, callbackQuery);
  });

  // Error handler for bot
  bot.on('polling_error', (error) => {
    logger.error('Telegram polling error:', error.message);
    if (error.stack) logger.error('Polling error stack:', error.stack);
  });

  bot.on('webhook_error', (error) => {
    logger.error('Telegram webhook error:', error.message);
    if (error.stack) logger.error('Webhook error stack:', error.stack);
  });

  logger.info('Telegram message handlers registered');
};

module.exports = { registerHandlers };
