const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const config = require('./config');
const logger = require('./services/logger');
const { apiLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');

const app = express();

// =============================================
// Security Middleware
// =============================================

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for API
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: config.corsOrigins === '*' ? true : config.corsOrigins.split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// =============================================
// Body Parsing
// =============================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =============================================
// Logging
// =============================================

// Morgan HTTP request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.http(message.trim()),
  },
  skip: (req) => req.url === '/health',
}));

// =============================================
// Rate Limiting
// =============================================

app.use('/api', apiLimiter);

// =============================================
// Health Check
// =============================================

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'AIX Nova Bot is running',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// =============================================
// API Routes
// =============================================

// Auth routes
app.use('/api/auth', authRoutes);

// Chat/AI routes (handles /api/chat, /api/image, /api/file, /api/history, /api/profile)
app.use('/api', chatRoutes);

// Admin panel routes
app.use('/api/admin', adminRoutes);

// =============================================
// Error Handling
// =============================================

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

module.exports = app;
