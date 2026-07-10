const Admin = require('../models/Admin');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Usage = require('../models/Usage');
const Settings = require('../models/Settings');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../services/logger');
const path = require('path');
const fs = require('fs');

/**
 * GET /api/admin/dashboard
 * Get admin dashboard stats
 */
const getDashboard = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const now = new Date();

  // Run all queries in parallel
  const [
    totalUsers,
    todayUsers,
    activeToday,
    totalConversations,
    totalMessages,
    usageToday,
    totalAdmins,
    bannedUsers,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: today } }),
    User.countDocuments({ lastActiveAt: { $gte: today } }),
    Conversation.countDocuments(),
    Message.countDocuments(),
    Usage.getTodayStats(),
    Admin.countDocuments({ isActive: true }),
    User.countDocuments({ banned: true }),
  ]);

  const todayStats = usageToday[0] || {
    totalMessages: 0,
    totalTokens: 0,
    uniqueUsers: [],
    avgResponseTime: 0,
  };

  res.json({
    success: true,
    data: {
      users: {
        total: totalUsers,
        today: todayUsers,
        activeToday,
        banned: bannedUsers,
      },
      conversations: {
        total: totalConversations,
      },
      messages: {
        total: totalMessages,
        today: todayStats.totalMessages,
      },
      tokens: {
        today: todayStats.totalTokens,
      },
      responseTime: {
        average: Math.round(todayStats.avgResponseTime || 0),
      },
      admins: {
        active: totalAdmins,
      },
      uniqueUsersToday: (todayStats.uniqueUsers || []).length,
    },
  });
});

/**
 * GET /api/admin/analytics
 * Get detailed analytics with date filtering
 */
const getAnalytics = asyncHandler(async (req, res) => {
  const { days = 7 } = req.query;
  const period = parseInt(days);

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  // Get period stats
  const periodStats = await Usage.getPeriodStats(startDate, endDate);

  // Get total users in period
  const usersInPeriod = await User.countDocuments({
    createdAt: { $gte: startDate, $lte: endDate },
  });

  // Get total messages in period
  const messagesInPeriod = await Message.countDocuments({
    createdAt: { $gte: startDate, $lte: endDate },
  });

  // Top users by message count
  const topUsers = await User.find()
    .sort({ totalMessages: -1 })
    .limit(10)
    .select('telegramId username firstName lastName totalMessages totalTokens lastActiveAt')
    .lean();

  // Messages by model
  const messagesByModel = await Message.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    { $group: { _id: '$model', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // Daily activity for chart
  const dailyActivity = await Message.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        messages: { $sum: 1 },
        users: { $addToSet: '$telegramId' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    success: true,
    data: {
      period: {
        start: startDate,
        end: endDate,
        days: period,
      },
      summary: {
        newUsers: usersInPeriod,
        totalMessages: messagesInPeriod,
        totalTokens: periodStats.reduce((sum, d) => sum + d.tokens, 0),
      },
      dailyActivity: dailyActivity.map((d) => ({
        date: d._id,
        messages: d.messages,
        uniqueUsers: d.users.length,
      })),
      messagesByModel: messagesByModel.map((m) => ({
        model: m._id,
        count: m.count,
      })),
      topUsers,
      periodStats,
    },
  });
});

/**
 * GET /api/admin/usage
 * Get usage statistics
 */
const getUsage = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const period = parseInt(days);

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  const usageData = await Usage.getPeriodStats(startDate, endDate);

  // Grand total
  const totalUsage = await Usage.aggregate([
    {
      $match: {
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        totalMessages: { $sum: '$messages' },
        totalTokens: { $sum: '$tokens.total' },
        totalPromptTokens: { $sum: '$tokens.prompt' },
        totalCompletionTokens: { $sum: '$tokens.completion' },
        totalImages: { $sum: '$images' },
        totalFiles: { $sum: '$files' },
        avgResponseTime: { $avg: '$responseTime' },
        totalCost: {
          $sum: {
            $add: [
              { $multiply: ['$tokens.prompt', 0.0000025] },
              { $multiply: ['$tokens.completion', 0.00001] },
            ],
          },
        },
      },
    },
  ]);

  res.json({
    success: true,
    data: {
      daily: usageData,
      totals: totalUsage[0] || {
        totalMessages: 0,
        totalTokens: 0,
        totalImages: 0,
        totalFiles: 0,
        avgResponseTime: 0,
        totalCost: 0,
      },
    },
  });
});

/**
 * GET /api/admin/settings
 * Get global bot settings
 */
const getSettings = asyncHandler(async (req, res) => {
  // Global settings stored in a singleton admin settings
  const settings = await Settings.findOne({ userId: null }) || {
    defaultModel: 'gpt-4o',
    defaultTemperature: 0.7,
    defaultMaxTokens: 2000,
    maintenanceMode: false,
  };

  res.json({
    success: true,
    data: settings,
  });
});

/**
 * PUT /api/admin/settings
 * Update global bot settings
 */
const updateSettings = asyncHandler(async (req, res) => {
  const allowedUpdates = [
    'defaultModel',
    'defaultTemperature',
    'defaultMaxTokens',
    'maintenanceMode',
    'systemPrompt',
  ];

  const updates = {};
  for (const [key, value] of Object.entries(req.body)) {
    if (allowedUpdates.includes(key)) {
      updates[key] = value;
    }
  }

  // Update or create settings
  const settings = await Settings.findOneAndUpdate(
    { userId: null },
    { $set: updates },
    { new: true, upsert: true }
  );

  logger.info(`Bot settings updated by ${req.admin.username}`);

  res.json({
    success: true,
    message: 'Settings updated successfully.',
    data: settings,
  });
});

/**
 * GET /api/admin/bot-status
 * Get bot health status
 */
const getBotStatus = asyncHandler(async (req, res) => {
  const mongoose = require('mongoose');

  const dbState = mongoose.connection.readyState;
  const stateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  // Get latest logs
  const logDir = path.join(__dirname, '..', '..', 'logs');
  let recentErrors = [];
  try {
    const errorLog = path.join(logDir, 'error.log');
    if (fs.existsSync(errorLog)) {
      const lines = fs.readFileSync(errorLog, 'utf8').split('\n').filter(Boolean);
      recentErrors = lines.slice(-10).reverse();
    }
  } catch {
    recentErrors = ['Unable to read error log'];
  }

  res.json({
    success: true,
    data: {
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform,
        environment: process.env.NODE_ENV,
      },
      database: {
        state: stateMap[dbState] || 'unknown',
        host: mongoose.connection.host || 'N/A',
      },
      bot: {
        lastErrors: recentErrors,
      },
    },
  });
});

/**
 * POST /api/admin/broadcast
 * Broadcast message to all users (placeholder - actual sending in telegram handlers)
 */
const broadcast = asyncHandler(async (req, res) => {
  const { message, parseMode = 'Markdown' } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Broadcast message is required.',
    });
  }

  const totalUsers = await User.countDocuments({ banned: false });

  logger.info(`Broadcast initiated by ${req.admin.username}: ${totalUsers} recipients`);

  res.json({
    success: true,
    message: 'Broadcast queued successfully.',
    data: {
      totalRecipients: totalUsers,
      message,
      parseMode,
    },
  });
});

/**
 * GET /api/admin/logs
 * Get application logs
 */
const getLogs = asyncHandler(async (req, res) => {
  const { type = 'combined', lines = 100 } = req.query;

  const logDir = path.join(__dirname, '..', '..', 'logs');
  const logFiles = {
    error: 'error.log',
    combined: 'combined.log',
    requests: 'requests.log',
    bot: 'bot-events.log',
  };

  const fileName = logFiles[type] || logFiles.combined;
  const filePath = path.join(logDir, fileName);

  let content = '';
  try {
    if (fs.existsSync(filePath)) {
      const allLines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
      content = allLines.slice(-Math.min(parseInt(lines), 1000)).join('\n');
    } else {
      content = 'Log file not found.';
    }
  } catch (error) {
    content = `Error reading log file: ${error.message}`;
  }

  res.json({
    success: true,
    data: {
      type,
      file: fileName,
      lines: content.split('\n').length,
      content,
    },
  });
});

/**
 * GET /api/admin/admins
 * List all admin accounts
 */
const getAdmins = asyncHandler(async (req, res) => {
  const admins = await Admin.find()
    .select('-password')
    .sort({ role: 1, createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: admins,
  });
});

/**
 * POST /api/admin/admins
 * Create new admin
 */
const createAdmin = asyncHandler(async (req, res) => {
  const { username, password, email, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username and password are required.',
    });
  }

  const existing = await Admin.findOne({ username: username.toLowerCase() });
  if (existing) {
    return res.status(409).json({
      success: false,
      message: 'Username already exists.',
    });
  }

  const admin = await Admin.create({
    username,
    password,
    email: email || '',
    role: role || 'admin',
    addedBy: req.admin._id,
  });

  logger.info(`New admin created: ${admin.username} by ${req.admin.username}`);

  res.status(201).json({
    success: true,
    message: 'Admin created successfully.',
    data: admin.toJSON(),
  });
});

/**
 * DELETE /api/admin/admins/:id
 * Delete an admin account
 */
const deleteAdmin = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.params.id);
  if (!admin) {
    return res.status(404).json({
      success: false,
      message: 'Admin not found.',
    });
  }

  // Prevent self-deletion
  if (admin._id.toString() === req.admin._id.toString()) {
    return res.status(400).json({
      success: false,
      message: 'You cannot delete your own account.',
    });
  }

  // Prevent deleting super admins (unless also super)
  if (admin.role === 'super' && req.admin.role !== 'super') {
    return res.status(403).json({
      success: false,
      message: 'Only super admins can delete super admin accounts.',
    });
  }

  await Admin.deleteOne({ _id: admin._id });

  logger.info(`Admin deleted: ${admin.username} by ${req.admin.username}`);

  res.json({
    success: true,
    message: 'Admin deleted successfully.',
  });
});

module.exports = {
  getDashboard,
  getAnalytics,
  getUsage,
  getSettings,
  updateSettings,
  getBotStatus,
  broadcast,
  getLogs,
  getAdmins,
  createAdmin,
  deleteAdmin,
};
