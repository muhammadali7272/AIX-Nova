const express = require('express');
const router = express.Router();
const { chatValidation, imageValidation, fileValidation } = require('../middleware/validate');
const { chatLimiter } = require('../middleware/rateLimiter');
const chatController = require('../controllers/chatController');

// POST /api/chat - Send message and get AI response
router.post('/chat', chatLimiter, chatValidation, chatController.sendMessage);

// POST /api/image - Analyze an image
router.post('/image', imageValidation, chatController.analyzeImage);

// POST /api/file - Analyze a file
router.post('/file', fileValidation, chatController.analyzeFile);

// GET /api/history - Get conversation history
router.get('/history', chatController.getHistory);

// DELETE /api/history - Clear conversation history
router.delete('/history', chatController.clearHistory);

// GET /api/profile - Get user profile
router.get('/profile', chatController.getProfile);

// PUT /api/profile - Update user profile
router.put('/profile', chatController.updateProfile);

module.exports = router;
