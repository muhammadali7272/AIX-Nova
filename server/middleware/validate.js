const { body, query, param, validationResult } = require('express-validator');
const logger = require('../services/logger');

/**
 * Middleware to check validation results and return errors
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

/**
 * Sanitize string input - strip HTML tags and trim
 */
const sanitizeString = (value) => {
  if (typeof value === 'string') {
    return value
      .replace(/<[^>]*>/g, '') // Strip HTML tags
      .trim();
  }
  return value;
};

/**
 * Login validation rules
 */
const loginValidation = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3-30 characters')
    .customSanitizer(sanitizeString),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  validate,
];

/**
 * Chat message validation rules
 */
const chatValidation = [
  body('message')
    .trim()
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ max: 10000 })
    .withMessage('Message too long (max 10000 characters)')
    .customSanitizer(sanitizeString),
  body('telegramId')
    .optional()
    .isNumeric()
    .withMessage('Telegram ID must be numeric'),
  body('model')
    .optional()
    .isIn(['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'])
    .withMessage('Invalid model'),
  validate,
];

/**
 * Image analysis validation
 */
const imageValidation = [
  body('imageUrl')
    .trim()
    .notEmpty()
    .withMessage('Image URL is required')
    .isURL()
    .withMessage('Invalid URL format'),
  body('prompt')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .customSanitizer(sanitizeString),
  validate,
];

/**
 * File analysis validation
 */
const fileValidation = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('File content is required')
    .isLength({ max: 50000 })
    .withMessage('File content too long (max 50000 characters)'),
  body('fileName')
    .trim()
    .notEmpty()
    .withMessage('File name is required')
    .isLength({ max: 255 })
    .customSanitizer(sanitizeString),
  validate,
];

/**
 * Profile update validation
 */
const profileValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .customSanitizer(sanitizeString),
  body('lastName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .customSanitizer(sanitizeString),
  body('languageCode')
    .optional()
    .isIn(['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar'])
    .withMessage('Invalid language code'),
  validate,
];

/**
 * Settings update validation
 */
const settingsValidation = [
  body('model')
    .optional()
    .isIn(['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'])
    .withMessage('Invalid model'),
  body('temperature')
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage('Temperature must be between 0 and 2'),
  body('maxTokens')
    .optional()
    .isInt({ min: 100, max: 16384 })
    .withMessage('Max tokens must be between 100 and 16384'),
  body('systemPrompt')
    .optional()
    .trim()
    .isLength({ max: 3000 })
    .customSanitizer(sanitizeString),
  body('language')
    .optional()
    .isLength({ min: 2, max: 10 }),
  body('notifications')
    .optional()
    .isBoolean(),
  validate,
];

module.exports = {
  validate,
  loginValidation,
  chatValidation,
  imageValidation,
  fileValidation,
  profileValidation,
  settingsValidation,
};
