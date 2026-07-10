const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Settings = require('../models/Settings');
const logger = require('../services/logger');

/**
 * Escape ALL 19 reserved MarkdownV2 characters.
 * Reserved: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * Use on ALL text content before sending with parse_mode: 'MarkdownV2'
 */
const escapeMarkdownV2 = (text) => {
  if (typeof text !== 'string') return '';
  return text
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/&/g, '\\&')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
};

/**
 * Build a MarkdownV2 string with intentional bold markers.
 * Usage: bold("text") → "*escaped text*"
 */
const bold = (text) => '*' + escapeMarkdownV2(text) + '*';

/**
 * Build a link: [text](url)
 */
const link = (text, url) => '[' + escapeMarkdownV2(text) + '](' + escapeMarkdownV2(url) + ')';

/**
 * Build inline code: `text`
 */
const code = (text) => '`' + escapeMarkdownV2(text) + '`';

/**
 * Escape text then use as-is (for plain text segments)
 */
const esc = (text) => escapeMarkdownV2(text);

/**
 * Safe send helper: escapes text, sends with MarkdownV2, catches & logs errors
 */
const sendSafe = async (bot, chatId, text, options = {}) => {
  try {
    await bot.sendMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: options.disableWebPagePreview !== false,
      ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
    });
  } catch (error) {
    logger.error('sendSafe failed, sending as plain text. Error:', error.message);
    logger.error('Failed text:', text.substring(0, 500));
    // Fallback: send as plain text without parse_mode
    try {
      await bot.sendMessage(chatId, text.replace(/\*|_|~|`|\[|\]|\(|\)/g, ''));
    } catch (fallbackError) {
      logger.error('sendSafe plain text fallback also failed:', fallbackError.message);
    }
  }
};

/**
 * Register all bot commands
 */
const registerCommands = (bot) => {
  // ============================================================
  // /start command
  // ============================================================
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userData = msg.from;

    try {
      // Save/update user
      const user = await User.findOneAndUpdate(
        { telegramId: userData.id },
        {
          $set: {
            username: userData.username || '',
            firstName: userData.first_name || 'User',
            lastName: userData.last_name || '',
            languageCode: userData.language_code || 'en',
            isPremium: userData.is_premium || false,
            lastActiveAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );

      // Create default settings if not exists
      await Settings.findOneAndUpdate(
        { telegramId: userData.id },
        {
          $setOnInsert: {
            userId: user._id,
            telegramId: userData.id,
          },
        },
        { upsert: true }
      );

      const firstName = esc(userData.first_name || 'there');
      const welcomeMessage = [
        '🚀 ' + bold('Welcome to AIX Nova!') + ' 🤖',
        '',
        esc('Hello') + ' ' + firstName + '! ' + esc("I'm an AI-powered assistant ready to help you."),
        '',
        bold('What I can do:'),
        '✨ ' + esc('Answer questions and have conversations'),
        '🖼️ ' + esc('Analyze images'),
        '📄 ' + esc('Read and analyze files'),
        '💡 ' + esc('Provide creative ideas and solutions'),
        '🔧 ' + esc('Help with coding, writing, and more'),
        '',
        bold('Commands:'),
        esc('/help') + ' \\- ' + esc('Show detailed help'),
        esc('/settings') + ' \\- ' + esc('Configure your preferences'),
        esc('/history') + ' \\- ' + esc('View conversation history'),
        esc('/clear') + ' \\- ' + esc('Clear conversation history'),
        esc('/about') + ' \\- ' + esc('About AIX Nova'),
        '',
        bold("Let's get started!") + ' ' + esc('Just send me a message or use the commands above.') + ' 🎯',
      ].join('\n');

      await sendSafe(bot, chatId, welcomeMessage);

      logger.info(`User started bot: ${userData.id} (@${userData.username || 'no username'})`);
    } catch (error) {
      logger.error('Start command error:', error);
      logger.error('Start command stack:', error.stack);
      const errorMsg = '❌ ' + esc('Error:') + ' ' + esc(error.message || 'Unknown error');
      await sendSafe(bot, chatId, errorMsg);
    }
  });

  // ============================================================
  // /help command
  // ============================================================
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const helpMessage = [
        'ℹ️ ' + bold('AIX Nova Help') + ' 🤖',
        '',
        bold('Commands:'),
        esc('/start') + ' \\- ' + esc('Start the bot and get welcome message'),
        esc('/help') + ' \\- ' + esc('Show this help message'),
        esc('/settings') + ' \\- ' + esc('Configure AI model, temperature, and more'),
        esc('/history') + ' \\- ' + esc('View your recent conversation history'),
        esc('/clear') + ' \\- ' + esc('Clear all conversation history'),
        esc('/about') + ' \\- ' + esc('Learn more about AIX Nova'),
        '',
        bold('Tips:'),
        '💬 ' + esc('Send any text to chat with AI'),
        '🖼️ ' + esc('Send an image to analyze it'),
        '📎 ' + esc('Send a file to read and analyze'),
        '📝 ' + esc('Code blocks are formatted with markdown'),
        '',
        bold('Settings:'),
        esc('Use /settings to change:'),
        '• ' + esc('AI Model (GPT-4o, GPT-4o Mini, etc.)'),
        '• ' + esc('Temperature (creativity level)'),
        '• ' + esc('Max tokens (response length)'),
        '• ' + esc('System prompt (AI behavior)'),
        '',
        esc('Need more help? Contact the administrator.'),
      ].join('\n');

      await sendSafe(bot, chatId, helpMessage);
    } catch (error) {
      logger.error('Help command error:', error);
      logger.error('Help command stack:', error.stack);
      const errorMsg = '❌ ' + esc('Error:') + ' ' + esc(error.message || 'Failed to show help');
      await sendSafe(bot, chatId, errorMsg);
    }
  });

  // ============================================================
  // /settings command
  // ============================================================
  bot.onText(/\/settings/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
      const settings = await Settings.findOne({ telegramId });
      if (!settings) {
        await sendSafe(bot, chatId, '❌ ' + esc('Settings not found. Please use /start first.'));
        return;
      }

      const systemPreview = settings.systemPrompt
        ? esc(settings.systemPrompt.substring(0, 200))
        : '';
      const systemSuffix = settings.systemPrompt && settings.systemPrompt.length > 200 ? '...' : '';

      const settingsMessage = [
        '⚙️ ' + bold('Your Settings'),
        '',
        bold('Model:') + ' ' + esc(settings.model),
        bold('Temperature:') + ' ' + esc(String(settings.temperature)),
        bold('Max Tokens:') + ' ' + esc(String(settings.maxTokens)),
        bold('Language:') + ' ' + esc(settings.language),
        bold('Notifications:') + ' ' + (settings.notifications ? '✅ ' + esc('Enabled') : '❌ ' + esc('Disabled')),
        bold('Streaming:') + ' ' + (settings.streamingEnabled ? '✅ ' + esc('Enabled') : '❌ ' + esc('Disabled')),
        '',
        bold('System Prompt:'),
        systemPreview + systemSuffix,
        '',
        esc('Settings can be changed via the Admin Panel or API.'),
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

      await sendSafe(bot, chatId, settingsMessage, { replyMarkup: keyboard });
    } catch (error) {
      logger.error('Settings command error:', error);
      logger.error('Settings command stack:', error.stack);
      const errorMsg = '❌ ' + esc('Error loading settings:') + ' ' + esc(error.message || 'Unknown error');
      await sendSafe(bot, chatId, errorMsg);
    }
  });

  // ============================================================
  // /history command
  // ============================================================
  bot.onText(/\/history/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
      const user = await User.findOne({ telegramId });
      if (!user) {
        await sendSafe(bot, chatId, '📜 ' + bold('No conversation history found.') + ' ' + esc('Use /start to begin!'));
        return;
      }

      const conversations = await Conversation.find({ userId: user._id })
        .sort({ lastMessageAt: -1 })
        .limit(10)
        .lean();

      if (conversations.length === 0) {
        await sendSafe(bot, chatId, '📜 ' + bold('No conversations yet.') + ' ' + esc('Start chatting to create history!'));
        return;
      }

      const lines = ['📜 ' + bold('Your Recent Conversations'), ''];
      let totalMessages = 0;

      for (let i = 0; i < conversations.length; i++) {
        const conv = conversations[i];
        totalMessages += conv.messageCount || 0;
        const date = new Date(conv.lastMessageAt).toLocaleDateString();
        const title = esc(conv.title || 'Chat');
        const msgs = esc(String(conv.messageCount || 0));
        lines.push(esc(String(i + 1)) + '. ' + bold(title) + ' \\- ' + esc(date) + ' (' + msgs + ' ' + esc('msgs') + ')');
      }

      lines.push('');
      lines.push(bold('Total:') + ' ' + esc(String(totalMessages)) + ' ' + esc('messages across') + ' ' + esc(String(conversations.length)) + ' ' + esc('conversations'));
      lines.push('');
      lines.push(esc('Use /clear to clear all history.'));

      await sendSafe(bot, chatId, lines.join('\n'));
    } catch (error) {
      logger.error('History command error:', error);
      logger.error('History command stack:', error.stack);
      const errorMsg = '❌ ' + esc('Error loading history:') + ' ' + esc(error.message || 'Unknown error');
      await sendSafe(bot, chatId, errorMsg);
    }
  });

  // ============================================================
  // /clear command
  // ============================================================
  bot.onText(/\/clear/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
      const user = await User.findOne({ telegramId });
      if (!user) {
        await bot.sendMessage(chatId, esc('No history to clear.'));
        return;
      }

      const conversations = await Conversation.find({ userId: user._id });
      const convIds = conversations.map((c) => c._id);

      if (convIds.length > 0) {
        await Message.deleteMany({ conversationId: { $in: convIds } });
      }
      await Conversation.deleteMany({ userId: user._id });

      user.totalMessages = 0;
      user.totalTokens = 0;
      await user.save();

      logger.info(`Telegram user cleared history: ${telegramId}`);

      await sendSafe(bot, chatId, '🗑️ ' + bold('Conversation history cleared successfully!'));
    } catch (error) {
      logger.error('Clear command error:', error);
      logger.error('Clear command stack:', error.stack);
      const errorMsg = '❌ ' + esc('Error clearing history:') + ' ' + esc(error.message || 'Unknown error');
      await sendSafe(bot, chatId, errorMsg);
    }
  });

  // ============================================================
  // /about command
  // ============================================================
  bot.onText(/\/about/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const aboutMessage = [
        '🤖 ' + bold('About AIX Nova'),
        '',
        esc('AIX Nova is an advanced AI-powered Telegram bot built with:'),
        '',
        '🚀 ' + bold('Node.js & Express') + ' \\- ' + esc('Fast and scalable backend'),
        '🧠 ' + bold('OpenAI GPT-4o') + ' \\- ' + esc('State-of-the-art AI model'),
        '🗄️ ' + bold('MongoDB Atlas') + ' \\- ' + esc('Cloud database'),
        '📱 ' + bold('Telegram Bot API') + ' \\- ' + esc('Seamless messaging'),
        '',
        bold('Features:'),
        '✨ ' + esc('Natural conversation with AI'),
        '🖼️ ' + esc('Image understanding and analysis'),
        '📄 ' + esc('File reading and analysis'),
        '💬 ' + esc('Conversation memory'),
        '⚙️ ' + esc('Customizable settings'),
        '🔒 ' + esc('Secure and private'),
        '',
        bold('Version:') + ' 1.0.0',
        esc('Made with') + ' ❤️ ' + esc('by AIX Nova Team'),
      ].join('\n');

      await sendSafe(bot, chatId, aboutMessage);
    } catch (error) {
      logger.error('About command error:', error);
      logger.error('About command stack:', error.stack);
      const errorMsg = '❌ ' + esc('Error:') + ' ' + esc(error.message || 'Failed to show about info');
      await sendSafe(bot, chatId, errorMsg);
    }
  });

  logger.info('Telegram commands registered');
};

module.exports = { registerCommands, escapeMarkdownV2 };
