const path = require('path');
const crypto = require('crypto');

// Load .env from server directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ============================================================
// Auto-generated secure defaults (only used when env vars are missing)
// ============================================================
const autoJwtSecret = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
const autoAdminUsername = process.env.ADMIN_USERNAME || `admin_${crypto.randomBytes(4).toString('hex')}`;
const autoAdminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(24).toString('base64url');
const autoAdminEmail = process.env.ADMIN_EMAIL || 'admin@aixnova.com';

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigins: process.env.CORS_ORIGINS || '*',

  // MongoDB (user must provide)
  mongoUri: process.env.MONGODB_URI,

  // OpenAI (user must provide)
  openaiApiKey: process.env.OPENAI_API_KEY,

  // Telegram (user must provide)
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,

  // JWT - auto-generated if not set
  jwtSecret: autoJwtSecret,
  jwtExpiresIn: '7d',

  // Rate Limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later.',
  },

  // Backend URL - inferred from server port configuration
  backendUrl: process.env.BACKEND_URL || `http://localhost:${parseInt(process.env.PORT, 10) || 5000}`,

  // Admin credentials - auto-generated if not set
  admin: {
    username: autoAdminUsername,
    password: autoAdminPassword,
    email: autoAdminEmail,
  },
};

// Warn about required placeholders (only MONGODB_URI, OPENAI_API_KEY, TELEGRAM_BOT_TOKEN)
// We check for actual placeholder text like "YOUR_" - NOT real connection strings
const checkPlaceholder = (key, value) => {
  if (!value) return true;
  const val = String(value);
  // Only flag if it literally contains "YOUR_" - this is the user's placeholder text
  if (val.includes('YOUR_')) return true;
  // Flag if it's the example template text
  if (val === 'mongodb+srv://<username>:<password>@<cluster>.mongodb.net/aix-nova?retryWrites=true&w=majority') return true;
  if (val === 'sk-your-openai-api-key-here' || val === 'sk-your-openai-api-key') return true;
  if (val === 'your-telegram-bot-token-here' || val === 'your-telegram-bot-token') return true;
  return false;
};

if (checkPlaceholder('MONGODB_URI', process.env.MONGODB_URI)) {
  console.warn('WARNING: MONGODB_URI is not configured. Set it in server/.env');
}
if (checkPlaceholder('OPENAI_API_KEY', process.env.OPENAI_API_KEY)) {
  console.warn('WARNING: OPENAI_API_KEY is not configured. Set it in server/.env');
}
if (checkPlaceholder('TELEGRAM_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN)) {
  console.warn('WARNING: TELEGRAM_BOT_TOKEN is not configured. Set it in server/.env');
}

module.exports = config;
