const app = require('./app');
const config = require('./config');
const logger = require('./services/logger');
const connectDB = require('./config/database');
const { initBot } = require('./telegram/bot');
const Admin = require('./models/Admin');
const path = require('path');

// Load .env from server directory
require('dotenv').config({ path: path.join(__dirname, '.env') });

/**
 * Seed default admin account if none exists
 */
const seedAdmin = async () => {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      const admin = await Admin.create({
        username: config.admin.username,
        password: config.admin.password,
        email: config.admin.email,
        role: 'super',
        permissions: {
          canManageUsers: true,
          canManageAdmins: true,
          canBroadcast: true,
          canViewLogs: true,
          canViewAnalytics: true,
          canManageSettings: true,
        },
      });
      logger.info(`✓ Default admin created: ${admin.username}`);
      logger.warn(`  ┌──────────────────────────────────────────────┐`);
      logger.warn(`  │         ADMIN LOGIN CREDENTIALS              │`);
      logger.warn(`  │  These were auto-generated. SAVE THEM NOW!   │`);
      logger.warn(`  ├──────────────────────────────────────────────┤`);
      logger.warn(`  │  Username: ${config.admin.username.padEnd(33)}│`);
      logger.warn(`  │  Password: ${config.admin.password.padEnd(33)}│`);
      logger.warn(`  │  Email:    ${config.admin.email.padEnd(33)}│`);
      logger.warn(`  ├──────────────────────────────────────────────┤`);
      logger.warn(`  │  API Login: POST /api/auth/login             │`);
      logger.warn(`  │  Dashboard: GET  /api/admin/dashboard        │`);
      logger.warn(`  └──────────────────────────────────────────────┘`);
      logger.warn(`To set custom credentials, add to server/.env:`);
      logger.warn(`  ADMIN_USERNAME=yourname`);
      logger.warn(`  ADMIN_PASSWORD=yourpass`);
      logger.warn(`  ADMIN_EMAIL=youremail`);
    } else {
      logger.info(`Admin accounts found: ${adminCount}`);
    }
  } catch (error) {
    logger.error('Admin seed error:', error.message);
  }
};

/**
 * Check for placeholder values that the user needs to replace
 */
const checkPlaceholders = () => {
  const placeholders = [
    { key: 'MONGODB_URI', val: config.mongoUri, url: 'https://www.mongodb.com/atlas' },
    { key: 'OPENAI_API_KEY', val: config.openaiApiKey, url: 'https://platform.openai.com/api-keys' },
    { key: 'TELEGRAM_BOT_TOKEN', val: config.telegramBotToken, url: 'https://t.me/BotFather' },
  ];

  let hasPlaceholder = false;
  for (const p of placeholders) {
    if (!p.val || p.val.includes('YOUR_')) {
      logger.warn(`⚠  ${p.key} not configured — set it in server/.env`);
      logger.warn(`   Get one at: ${p.url}`);
      hasPlaceholder = true;
    }
  }
  return hasPlaceholder;
};

/**
 * Initialize and start the server
 */
const startServer = async () => {
  try {
    // Connect to MongoDB
    const conn = await connectDB();

    // Check for placeholder config values
    const needsConfig = checkPlaceholders();

    // Seed default admin
    await seedAdmin();

    // Initialize Telegram bot
    const bot = await initBot();

    // Start Express server
    const server = app.listen(config.port, () => {
      logger.info(`═══════════════════════════════════════════════`);
      logger.info(`  AIX Nova Bot Server`);
      logger.info(`  Environment: ${config.nodeEnv}`);
      logger.info(`  Port: ${config.port}`);
      logger.info(`  MongoDB: ${conn.connection.host ? 'Connected ✓' : 'Not connected'}`);
      logger.info(`  Telegram Bot: ${bot ? 'Online ✓' : 'Offline — set TELEGRAM_BOT_TOKEN'}`);
      logger.info(`  API: http://localhost:${config.port}`);
      logger.info(`  Health: http://localhost:${config.port}/health`);
      if (needsConfig) {
        logger.info(`  ─────────────────────────────────────────────`);
        logger.info(`  ⚠  Configure your ${'MONGODB_URI, OPENAI_API_KEY, and TELEGRAM_BOT_TOKEN'}`);
        logger.info(`     in server/.env to enable all features.`);
      }
      logger.info(`═══════════════════════════════════════════════`);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        // Close MongoDB connection
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');

        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection:', reason);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
