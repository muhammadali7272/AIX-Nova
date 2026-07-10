const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Settings = require('../models/Settings');
const Usage = require('../models/Usage');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../services/logger');

/**
 * GET /api/admin/users
 * Get all users with pagination and search
 */
const getUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const search = req.query.search || '';
  const sortBy = req.query.sortBy || '-createdAt';

  const query = {};
  if (search) {
    query.$or = [
      { username: { $regex: search, $options: 'i' } },
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { telegramId: isNaN(parseInt(search)) ? undefined : parseInt(search) },
    ].filter(Boolean);
  }

  const total = await User.countDocuments(query);
  const users = await User.find(query)
    .sort(sortBy)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * GET /api/admin/users/:id
 * Get single user with full details
 */
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found.',
    });
  }

  const settings = await Settings.findOne({ userId: user._id });
  const conversationCount = await Conversation.countDocuments({ userId: user._id });
  const messageCount = await Message.countDocuments({ userId: user._id });

  res.json({
    success: true,
    data: {
      user: user.toJSON(),
      settings: settings ? settings.toJSON() : null,
      stats: {
        conversations: conversationCount,
        messages: messageCount,
      },
    },
  });
});

/**
 * PUT /api/admin/users/:id/ban
 * Ban or unban a user
 */
const toggleBan = asyncHandler(async (req, res) => {
  const { ban, reason } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found.',
    });
  }

  user.banned = ban === true || ban === 'true';
  user.banReason = user.banned ? (reason || 'Violated terms of service') : '';
  user.bannedAt = user.banned ? new Date() : null;

  await user.save();

  logger.info(`User ${user.telegramId} ${user.banned ? 'banned' : 'unbanned'} by ${req.admin.username}`);

  res.json({
    success: true,
    message: user.banned ? 'User banned successfully.' : 'User unbanned successfully.',
    data: user.toJSON(),
  });
});

/**
 * DELETE /api/admin/users/:id
 * Delete user and all associated data
 */
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found.',
    });
  }

  // Delete all associated data
  const conversations = await Conversation.find({ userId: user._id });
  const convIds = conversations.map((c) => c._id);

  await Message.deleteMany({ userId: user._id });
  await Conversation.deleteMany({ userId: user._id });
  await Usage.deleteMany({ userId: user._id });
  await Settings.deleteOne({ userId: user._id });
  await User.deleteOne({ _id: user._id });

  logger.info(`User ${user.telegramId} deleted by ${req.admin.username}`);

  res.json({
    success: true,
    message: 'User and all associated data deleted.',
    data: {
      deletedUser: user.telegramId,
      deletedConversations: convIds.length,
    },
  });
});

/**
 * GET /api/admin/users/:id/chats
 * Get user's conversation history
 */
const getUserChats = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found.',
    });
  }

  const conversations = await Conversation.find({ userId: user._id })
    .sort({ lastMessageAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Conversation.countDocuments({ userId: user._id });

  res.json({
    success: true,
    data: {
      conversations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * GET /api/admin/users/:id/chats/:convId
 * Get messages from a specific conversation
 */
const getConversationMessages = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  const conversation = await Conversation.findOne({
    _id: req.params.convId,
    userId: req.params.id,
  });

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: 'Conversation not found.',
    });
  }

  const messages = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Message.countDocuments({ conversationId: conversation._id });

  res.json({
    success: true,
    data: {
      conversation,
      messages: messages.reverse(),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

module.exports = {
  getUsers,
  getUserById,
  toggleBan,
  deleteUser,
  getUserChats,
  getConversationMessages,
};
