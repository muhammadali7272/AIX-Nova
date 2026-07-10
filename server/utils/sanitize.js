/**
 * Sanitize string input - remove dangerous characters
 */
const sanitizeString = (input, maxLength = 10000) => {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .replace(/javascript:/gi, '') // Remove javascript: URLs
    .replace(/on\w+=/gi, ''); // Remove event handlers
};

/**
 * Sanitize object fields recursively
 */
const sanitizeObject = (obj, maxDepth = 5, currentDepth = 0) => {
  if (currentDepth > maxDepth) return {};
  if (typeof obj !== 'object' || obj === null) return obj;

  const sanitized = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    const sanitizedKey = sanitizeString(key, 100);
    
    if (typeof value === 'string') {
      sanitized[sanitizedKey] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[sanitizedKey] = sanitizeObject(value, maxDepth, currentDepth + 1);
    } else {
      sanitized[sanitizedKey] = value;
    }
  }

  return sanitized;
};

/**
 * Escape MongoDB special characters in string
 */
const escapeRegex = (string) => {
  if (typeof string !== 'string') return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Sanitize for MongoDB queries
 */
const sanitizeForQuery = (input) => {
  if (typeof input !== 'string') return input;
  // Prevent NoSQL injection
  return input.replace(/[\${}]/g, '');
};

/**
 * Validate and sanitize email
 */
const sanitizeEmail = (email) => {
  if (typeof email !== 'string') return '';
  const sanitized = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(sanitized) ? sanitized : '';
};

/**
 * Validate and sanitize URL
 */
const sanitizeUrl = (url) => {
  if (typeof url !== 'string') return '';
  try {
    const parsed = new URL(url.trim());
    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.href;
  } catch {
    return '';
  }
};

module.exports = {
  sanitizeString,
  sanitizeObject,
  escapeRegex,
  sanitizeForQuery,
  sanitizeEmail,
  sanitizeUrl,
};
