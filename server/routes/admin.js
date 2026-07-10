const express = require('express');
const router = express.Router();
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const userController = require('../controllers/userController');

// All admin routes require authentication
router.use(authenticate);

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// Analytics
router.get('/analytics', requirePermission('canViewAnalytics'), adminController.getAnalytics);

// Usage
router.get('/usage', requirePermission('canViewAnalytics'), adminController.getUsage);

// Settings
router.get('/settings', requirePermission('canManageSettings'), adminController.getSettings);
router.put('/settings', requirePermission('canManageSettings'), adminController.updateSettings);

// Bot Status
router.get('/bot-status', adminController.getBotStatus);

// Broadcast
router.post('/broadcast', requirePermission('canBroadcast'), adminController.broadcast);

// Logs
router.get('/logs', requirePermission('canViewLogs'), adminController.getLogs);

// User Management
router.get('/users', requirePermission('canManageUsers'), userController.getUsers);
router.get('/users/:id', requirePermission('canManageUsers'), userController.getUserById);
router.put('/users/:id/ban', requirePermission('canManageUsers'), userController.toggleBan);
router.delete('/users/:id', requirePermission('canManageUsers'), userController.deleteUser);
router.get('/users/:id/chats', requirePermission('canManageUsers'), userController.getUserChats);
router.get('/users/:id/chats/:convId', requirePermission('canManageUsers'), userController.getConversationMessages);

// Admin Management (super admin only)
router.get('/admins', authorize('super'), adminController.getAdmins);
router.post('/admins', authorize('super'), adminController.createAdmin);
router.delete('/admins/:id', authorize('super'), adminController.deleteAdmin);

module.exports = router;
