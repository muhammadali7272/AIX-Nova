const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { loginValidation } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/authController');

// POST /api/auth/login - Admin login
router.post('/login', authLimiter, loginValidation, authController.login);

// GET /api/auth/profile - Get admin profile (protected)
router.get('/profile', authenticate, authController.getProfile);

// POST /api/auth/verify - Verify token (protected)
router.post('/verify', authenticate, authController.verifyToken);

// PUT /api/auth/change-password - Change password (protected)
router.put('/change-password', authenticate, authController.changePassword);

module.exports = router;
