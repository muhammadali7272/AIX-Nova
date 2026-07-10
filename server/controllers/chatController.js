const openaiService = require('../services/openai');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Usage = require('../models/Usage');
const Settings = require('../models/Settings');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../services/logger');

/**
 * Get or create a Telegram user
 */
const getOrCreateUser = async (telegramId, userData = {}) => {
  let user = await User.findOne({ telegramId });

  if (!user) {
    user = await User.create({
      telegramId,
      username: userData.username || '',
      firstName: userData.firstName || 'User',
      lastName: userData.lastName || '',
      languageCode: userData.languageCode || 'en',
    });

    // Create default settings for new user
    await Settings.create({
      userId: user._id,
      telegramId,
    });

    logger.info(`New user created: ${telegramId}`);
  } else {
    // Update user info
    if (userData.username !== undefined) user.username = userData.username;
    if (userData.firstName !== undefined) user.firstName = userData.firstName;
    if (userData.lastName !== undefined) user.lastName = userData.lastName;
    if (userData.languageCode !== undefined) user.languageCode = userData.languageCode;

    user.lastActiveAt = new Date();
    await user.save();
  }

  return user;
};

/**
 * Get or create active conversation for a user
 */
const getOrCreateConversation = async (userId, telegramId) => {
  let conversation = await Conversation.findOne({
    userId,
    isActive: true,
  }).sort({ lastMessageAt: -1 });

  if (!conversation) {
    conversation = await Conversation.create({
      userId,
      telegramId,
      title: 'New Conversation',
    });
  }

  return conversation;
};

/**
 * Get recent message history for a conversation
 */
const getConversationHistory = async (conversationId, limit = 20) => {
  const messages = await Message.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return messages.reverse();
};

/**
 * POST /api/chat
 * Send a message and get AI response
 */
const sendMessage = asyncHandler(async (req, res) => {
  const { message, telegramId, model, temperature, maxTokens } = req.body;

  if (!telegramId) {
    return res.status(400).json({
      success: false,
      message: 'telegramId is required.',
    });
  }

  // Get or create user
  const user = await getOrCreateUser(telegramId, req.body);

  if (user.banned) {
    return res.status(403).json({
      success: false,
      message: user.banReason || 'You have been banned from using this bot.',
    });
  }

  // Get or create conversation
  const conversation = await getOrCreateConversation(user._id, telegramId);

  // Get user settings
  let settings = await Settings.findOne({ telegramId });
  if (!settings) {
    settings = await Settings.create({ userId: user._id, telegramId });
  }

  // Save user message
  await Message.create({
    conversationId: conversation._id,
    userId: user._id,
    telegramId,
    role: 'user',
    content: message,
  });

  // Update conversation
  conversation.messageCount += 1;
  conversation.lastMessageAt = new Date();
  await conversation.save();

  // Get conversation history
  const history = await getConversationHistory(conversation._id);

  // Build messages array for OpenAI
  const openaiMessages = openaiService.buildMessages(
    settings.systemPrompt,
    history.slice(0, -1), // exclude the current message which will be added
    message
  );

  // Send typing indicator (for REST API)
  res.write(JSON.stringify({ type: 'typing', status: 'generating' }) + '\n');

  try {
    // Get AI response
    const response = await openaiService.generateResponse(openaiMessages, {
      model: model || settings.model,
      temperature: temperature !== undefined ? temperature : settings.temperature,
      maxTokens: maxTokens || settings.maxTokens,
    });

    // Save AI response
    const aiMessage = await Message.create({
      conversationId: conversation._id,
      userId: user._id,
      telegramId,
      role: 'assistant',
      content: response.content,
      tokens: response.usage,
      model: response.model,
    });

    // Update conversation tokens
    conversation.totalTokens += response.usage.total;
    await conversation.save();

    // Update user stats
    user.totalMessages += 1;
    user.totalTokens += response.usage.total;
    await user.save();

    // Track usage
    await Usage.create({
      userId: user._id,
      telegramId,
      tokens: response.usage,
      messages: 1,
      responseTime: response.responseTime,
    });

    logger.info(
      `Chat response: user=${telegramId} model=${response.model} tokens=${response.usage.total} time=${response.responseTime}ms`
    );

    res.write(
      JSON.stringify({
        type: 'result',
        data: {
          id: aiMessage._id,
          content: response.content,
          role: 'assistant',
          model: response.model,
          usage: response.usage,
          responseTime: response.responseTime,
          conversationId: conversation._id,
        },
      }) + '\n'
    );
  } catch (error) {
    logger.error('Chat error:', error);
    res.write(
      JSON.stringify({
        type: 'error',
        message: error.message || 'Failed to generate AI response.',
      }) + '\n'
    );
  }

  res.end();
});

/**
 * POST /api/image
 * Analyze an image
 */
const analyzeImage = asyncHandler(async (req, res) => {
  const { imageUrl, prompt, telegramId } = req.body;

  if (!telegramId) {
    return res.status(400).json({
      success: false,
      message: 'telegramId is required.',
    });
  }

  const user = await getOrCreateUser(telegramId);

  if (user.banned) {
    return res.status(403).json({
      success: false,
      message: user.banReason || 'You have been banned.',
    });
  }

  const response = await openaiService.analyzeImage(imageUrl, prompt);

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

  res.json({
    success: true,
    data: {
      content: response.content,
      usage: response.usage,
      responseTime: response.responseTime,
    },
  });
});

/**
 * POST /api/file
 * Analyze a file
 */
const analyzeFile = asyncHandler(async (req, res) => {
  const { content, fileName, prompt, telegramId } = req.body;

  if (!telegramId) {
    return res.status(400).json({
      success: false,
      message: 'telegramId is required.',
    });
  }

  const user = await getOrCreateUser(telegramId);

  if (user.banned) {
    return res.status(403).json({
      success: false,
      message: user.banReason || 'You have been banned.',
    });
  }

  const response = await openaiService.readFile(content, fileName, prompt);

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

  res.json({
    success: true,
    data: {
      content: response.content,
      usage: response.usage,
      responseTime: response.responseTime,
    },
  });
});

/**
 * GET /api/history
 * Get conversation history for a user
 */
const getHistory = asyncHandler(async (req, res) => {
  const { telegramId, limit = 50, before } = req.query;

  if (!telegramId) {
    return res.status(400).json({
      success: false,
      message: 'telegramId query parameter is required.',
    });
  }

  const user = await User.findOne({ telegramId: parseInt(telegramId) });
  if (!user) {
    return res.json({ success: true, data: [] });
  }

  const query = { userId: user._id };

  // Pagination: get messages before this ID
  if (before) {
    query._id = { $lt: before };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(parseInt(limit), 100))
    .lean();

  res.json({
    success: true,
    data: messages.reverse(),
    hasMore: messages.length === parseInt(limit),
  });
});

/**
 * DELETE /api/history
 * Clear conversation history for a user
 */
const clearHistory = asyncHandler(async (req, res) => {
  const { telegramId } = req.body;

  if (!telegramId) {
    return res.status(400).json({
      success: false,
      message: 'telegramId is required.',
    });
  }

  const user = await User.findOne({ telegramId: parseInt(telegramId) });
  if (!user) {
    return res.json({ success: true, message: 'No history to clear.' });
  }

  // Delete all conversations and messages
  const conversations = await Conversation.find({ userId: user._id });
  const convIds = conversations.map((c) => c._id);

  if (convIds.length > 0) {
    await Message.deleteMany({ conversationId: { $in: convIds } });
  }

  await Conversation.deleteMany({ userId: user._id });

  // Reset user stats
  user.totalMessages = 0;
  user.totalTokens = 0;
  await user.save();

  logger.info(`History cleared for user: ${telegramId}`);

  res.json({
    success: true,
    message: 'Conversation history cleared successfully.',
    data: { deletedConversations: convIds.length },
  });
});

/**
 * GET /api/profile
 * Get user profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const { telegramId } = req.query;

  if (!telegramId) {
    return res.status(400).json({
      success: false,
      message: 'telegramId query parameter is required.',
    });
  }

  const user = await User.findOne({ telegramId: parseInt(telegramId) });
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found.',
    });
  }

  const settings = await Settings.findOne({ telegramId: user.telegramId });

  res.json({
    success: true,
    data: {
      user: user.toJSON(),
      settings: settings ? settings.toJSON() : null,
    },
  });
});

/**
 * PUT /api/profile
 * Update user profile or settings
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { telegramId, ...updates } = req.body;

  if (!telegramId) {
    return res.status(400).json({
      success: false,
      message: 'telegramId is required.',
    });
  }

  const user = await User.findOne({ telegramId: parseInt(telegramId) });
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found.',
    });
  }

  const userUpdates = {};
  const settingsUpdates = {};

  // Separate user vs settings updates
  const userFields = ['firstName', 'lastName', 'languageCode'];
  const settingsFields = [
    'model',
    'temperature',
    'maxTokens',
    'systemPrompt',
    'language',
    'notifications',
    'streamingEnabled',
  ];

  for (const [key, value] of Object.entries(updates)) {
    if (userFields.includes(key)) {
      userUpdates[key] = value;
    } else if (settingsFields.includes(key)) {
      settingsUpdates[key] = value;
    }
  }

  // Update user
  if (Object.keys(userUpdates).length > 0) {
    Object.assign(user, userUpdates);
    await user.save();
  }

  // Update settings
  if (Object.keys(settingsUpdates).length > 0) {
    const settings = await Settings.findOneAndUpdate(
      { telegramId },
      { $set: settingsUpdates },
      { new: true, upsert: true }
    );
    res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: {
        user: user.toJSON(),
        settings: settings.toJSON(),
      },
    });
  } else {
    res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: { user: user.toJSON() },
    });
  }
});

module.exports = {
  sendMessage,
  analyzeImage,
  analyzeFile,
  getHistory,
  clearHistory,
  getProfile,
  updateProfile,
  getOrCreateUser,
  getOrCreateConversation,
};
