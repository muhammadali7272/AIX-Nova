const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const logger = require('../services/logger');
const { registerCommands } = require('./commands');
const { registerHandlers } = require('./handlers');

let bot = null;

const initBot = async () => {
  if (!config.telegramBotToken) {
    logger.warn('TELEGRAM_BOT_TOKEN not configured. Telegram bot disabled.');
    return null;
  }

  try {
    if (config.nodeEnv === 'production') {
      // Use webhook in production
      bot = new TelegramBot(config.telegramBotToken, { webHook: { port: config.port } });
    } else {
      // Use polling in development
      bot = new TelegramBot(config.telegramBotToken, { polling: true });
    }

    // Get bot info
    const botInfo = await bot.getMe();
    logger.info(`Telegram bot initialized: @${botInfo.username} (ID: ${botInfo.id})`);

    // Set bot commands menu
    await bot.setMyCommands([
      { command: 'start', description: '🚀 Start the bot' },
      { command: 'help', description: 'ℹ️ Show help information' },
      { command: 'settings', description: '⚙️ Configure your settings' },
      { command: 'history', description: '📜 View your conversation history' },
      { command: 'clear', description: '🗑️ Clear conversation history' },
      { command: 'about', description: '🤖 About AIX Nova' },
    ]);

    // Register command handlers
    registerCommands(bot);

    // Register message and callback handlers
    registerHandlers(bot);

    logger.info('Telegram bot handlers registered');
    return bot;
  } catch (error) {
    logger.error('Failed to initialize Telegram bot:', error.message);
    return null;
  }
};

const getBot = () => bot;

module.exports = { initBot, getBot };
