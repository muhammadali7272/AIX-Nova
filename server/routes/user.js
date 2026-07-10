const express = require('express');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');

/**
 * User routes are mounted under /api/admin/users in admin.js
 * These handle profile & chat endpoints for external/telegram users
 */

// All user-related endpoints are handled through chat routes (/api/chat/*)
// Admin user management is in admin routes (/api/admin/users/*)

module.exports = router;
