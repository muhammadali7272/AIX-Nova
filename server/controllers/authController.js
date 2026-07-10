const jwt = require('jsonwebtoken');
const config = require('../config');
const Admin = require('../models/Admin');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../services/logger');

/**
 * Generate JWT token
 */
const generateToken = (admin) => {
  return jwt.sign(
    {
      id: admin._id,
      username: admin.username,
      role: admin.role,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
};

/**
 * POST /api/auth/login
 * Admin login
 */
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const admin = await Admin.findOne({ username: username.toLowerCase().trim() });
  if (!admin) {
    return res.status(401).json({
      success: false,
      message: 'Invalid username or password.',
    });
  }

  if (!admin.isActive) {
    return res.status(403).json({
      success: false,
      message: 'Account is deactivated. Contact super admin.',
    });
  }

  const isMatch = await admin.comparePassword(password);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Invalid username or password.',
    });
  }

  // Update last login
  admin.lastLogin = new Date();
  await admin.save();

  const token = generateToken(admin);

  logger.info(`Admin login: ${admin.username} (${admin.role})`);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      token,
      admin: admin.toJSON(),
    },
  });
});

/**
 * GET /api/auth/profile
 * Get current admin profile
 */
const getProfile = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: req.admin.toJSON(),
  });
});

/**
 * POST /api/auth/verify
 * Verify token is still valid
 */
const verifyToken = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    data: {
      admin: req.admin.toJSON(),
    },
  });
});

/**
 * PUT /api/auth/change-password
 * Change admin password
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Current password and new password are required.',
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 6 characters.',
    });
  }

  // Get admin with password
  const admin = await Admin.findById(req.admin._id);
  const isMatch = await admin.comparePassword(currentPassword);

  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Current password is incorrect.',
    });
  }

  admin.password = newPassword;
  await admin.save();

  logger.info(`Password changed for admin: ${admin.username}`);

  res.json({
    success: true,
    message: 'Password changed successfully.',
  });
});

module.exports = { login, getProfile, verifyToken, changePassword };
