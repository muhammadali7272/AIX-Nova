const OpenAI = require('openai');
const config = require('../config');
const logger = require('./logger');

/**
 * OpenAI API error status codes and their user-friendly messages.
 * These are safe to show to users — no API keys, no stack traces.
 */
const STATUS_MESSAGES = {
  400: 'The request was invalid. Please try again with a different message.',
  401: 'Authentication failed. The API key is invalid or has been revoked.',
  403: 'Access forbidden. The API key does not have permission for this operation.',
  404: 'The AI model is not available. Switching to a fallback model.',
  408: 'The request timed out. Please try again.',
  429: '⚠️ AI service is temporarily unavailable.\n\nPossible reasons:\n• API quota has been exceeded\n• Billing is not configured\n• Project usage limit has been reached\n\nPlease try again later or contact the administrator.',
  500: 'The AI service encountered an internal error. Please try again.',
  503: 'The AI service is temporarily unavailable. Please try again later.',
};

/**
 * Models to fall back to in order, when the primary model is unavailable.
 * Tries increasingly smaller/cheaper models.
 */
const FALLBACK_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];

/**
 * Extract HTTP status code from an OpenAI API error.
 * The OpenAI Node SDK wraps errors in a specific structure.
 */
const getStatusCode = (error) => {
  // OpenAI SDK v4+ errors have a `status` property
  if (error.status) return error.status;
  // Fallback: check error code for HTTP-like values
  if (error.code && typeof error.code === 'number') return error.code;
  // Check if it's an Axios-style error with response status
  if (error.response?.status) return error.response.status;
  return 0;
};

/**
 * Extract error message safely — never exposes API keys or internal details.
 */
const getSafeMessage = (error) => {
  const status = getStatusCode(error);
  return STATUS_MESSAGES[status] || 'An unexpected error occurred. Please try again later.';
};

/**
 * Extract error details for server-side logging only.
 * This is NEVER sent to users.
 */
const getLogDetails = (error) => {
  const status = getStatusCode(error);
  const details = {
    status,
    type: error.type || error.name || 'Unknown',
    message: error.message || 'No error message',
    code: error.code || 'N/A',
    param: error.param || 'N/A',
  };
  // Log the full error object for debugging (server console only)
  if (error.stack) {
    details.stack = error.stack.split('\n').slice(0, 5).join('\n');
  }
  return details;
};

/**
 * Check if an error is retryable (transient server error, timeout)
 * Note: 429 (quota exceeded) is NOT retryable — waiting seconds won't fix a billing issue.
 */
const isRetryable = (error) => {
  const status = getStatusCode(error);
  // 5xx (server errors) — retry
  // 408 (timeout) — retry
  // 0 (unknown/network error) — retry
  return status === 408 || status === 500 || status === 503 || status === 0;
};

/**
 * Check if error indicates the model is unavailable (should trigger fallback)
 */
const isModelError = (error) => {
  const status = getStatusCode(error);
  const msg = (error.message || '').toLowerCase();
  return (
    status === 404 ||
    msg.includes('model not found') ||
    msg.includes('model_not_found') ||
    msg.includes('does not exist') ||
    msg.includes('not found')
  );
};

/**
 * Check if error is auth-related (should NOT retry, should NOT expose details)
 */
const isAuthError = (error) => {
  const status = getStatusCode(error);
  return status === 401 || status === 403;
};

class OpenAIService {
  constructor() {
    if (!config.openaiApiKey) {
      logger.warn('OpenAI API key not configured. AI features will be unavailable.');
    }
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
      maxRetries: 0, // We handle retries ourselves with smarter logic
      timeout: 60000, // 60s timeout
    });
    this.defaultModel = 'gpt-4o';
    this.fallbackModels = FALLBACK_MODELS;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  /**
   * Classify an OpenAI API error and return:
   *  - userMessage: safe string to show to the user
   *  - retryable: whether to retry the request
   *  - modelError: whether to try a fallback model
   *  - authError: whether the API key is invalid
   */
  classifyError(error) {
    const status = getStatusCode(error);
    const safeMessage = getSafeMessage(error);
    const logDetails = getLogDetails(error);

    // Log the COMPLETE error details to server console only
    logger.error('OpenAI API error:', JSON.stringify(logDetails, null, 2));
    if (error.stack) {
      logger.error('OpenAI error stack:', error.stack);
    }

    return {
      status,
      userMessage: safeMessage,
      retryable: isRetryable(error),
      modelError: isModelError(error),
      authError: isAuthError(error),
      logDetails,
    };
  }

  /**
   * Attempt to switch to a fallback model when the primary is unavailable.
   * Returns the fallback model name, or null if no fallback is available.
   */
  getFallbackModel(currentModel) {
    const currentIndex = this.fallbackModels.indexOf(currentModel);
    if (currentIndex === -1 || currentIndex >= this.fallbackModels.length - 1) {
      return null;
    }
    return this.fallbackModels[currentIndex + 1];
  }

  /**
   * Generate a response from OpenAI using the Chat Completions API.
   * Includes automatic retry for transient errors and model fallback.
   */
  async generateResponse(messages, options = {}) {
    const {
      model = this.defaultModel,
      temperature = 0.7,
      maxTokens = 2000,
      stream = false,
    } = options;

    let currentModel = model;
    let lastError = null;

    for (let modelAttempt = 0; modelAttempt <= 1; modelAttempt++) {
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          const startTime = Date.now();

          const response = await this.client.chat.completions.create({
            model: currentModel,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream,
          });

          if (stream) {
            return response;
          }

          const responseTime = Date.now() - startTime;

          return {
            content: response.choices[0]?.message?.content || '',
            usage: {
              prompt: response.usage?.prompt_tokens || 0,
              completion: response.usage?.completion_tokens || 0,
              total: response.usage?.total_tokens || 0,
            },
            model: response.model,
            responseTime,
          };
        } catch (error) {
          lastError = error;
          const classified = this.classifyError(error);

          // Auth errors: never retry, never fallback
          if (classified.authError) {
            logger.error(`OpenAI auth error (${classified.status}): API key is invalid or unauthorized.`);
            throw classified;
          }

          // Non-retryable client errors (400 bad request, etc.): throw immediately
          if (!classified.retryable && !classified.modelError) {
            logger.error(`OpenAI non-retryable error (${classified.status}): ${classified.logDetails.message}`);
            throw classified;
          }

          // Model unavailable: try fallback
          if (classified.modelError && modelAttempt === 0) {
            const fallbackModel = this.getFallbackModel(currentModel);
            if (fallbackModel) {
              logger.warn(`Model "${currentModel}" unavailable, falling back to "${fallbackModel}"`);
              currentModel = fallbackModel;
              break; // Break retry loop, try with new model
            }
          }

          // Retryable error (429, 5xx, timeout): log and retry with backoff
          if (attempt < this.maxRetries) {
            const delay = this.retryDelay * Math.pow(2, attempt - 1);
            logger.warn(
              `OpenAI retry ${attempt}/${this.maxRetries} for model "${currentModel}" after ${delay}ms. ` +
              `Status: ${classified.status}, Error: ${classified.logDetails.message}`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            // Last retry failed
            logger.error(
              `OpenAI all retries exhausted for model "${currentModel}". ` +
              `Status: ${classified.status}, Error: ${classified.logDetails.message}`
            );
            // If we haven't tried fallback yet, do it now
            if (modelAttempt === 0) {
              const fallbackModel = this.getFallbackModel(currentModel);
              if (fallbackModel) {
                logger.warn(`Retries exhausted for "${currentModel}", falling back to "${fallbackModel}"`);
                currentModel = fallbackModel;
                break; // Try fallback model
              }
            }
          }
        }
      }
    }

    // All retries and fallbacks exhausted
    throw this.classifyError(lastError);
  }

  /**
   * Analyze an image using GPT-4o vision capabilities
   */
  async analyzeImage(imageUrl, prompt = 'Describe this image in detail.') {
    try {
      const startTime = Date.now();

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: imageUrl, detail: 'high' },
              },
            ],
          },
        ],
        max_tokens: 1000,
      });

      const responseTime = Date.now() - startTime;

      return {
        content: response.choices[0]?.message?.content || '',
        usage: {
          prompt: response.usage?.prompt_tokens || 0,
          completion: response.usage?.completion_tokens || 0,
          total: response.usage?.total_tokens || 0,
        },
        responseTime,
      };
    } catch (error) {
      const classified = this.classifyError(error);
      logger.error('Image analysis failed:', JSON.stringify(classified.logDetails, null, 2));
      throw classified;
    }
  }

  /**
   * Read and analyze file content
   */
  async readFile(fileContent, fileName, prompt = 'Read and analyze this file.') {
    try {
      const startTime = Date.now();

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: `File: ${fileName}\n\nContent:\n${fileContent}\n\n${prompt}`,
          },
        ],
        max_tokens: 4096,
      });

      const responseTime = Date.now() - startTime;

      return {
        content: response.choices[0]?.message?.content || '',
        usage: {
          prompt: response.usage?.prompt_tokens || 0,
          completion: response.usage?.completion_tokens || 0,
          total: response.usage?.total_tokens || 0,
        },
        responseTime,
      };
    } catch (error) {
      const classified = this.classifyError(error);
      logger.error('File reading failed:', JSON.stringify(classified.logDetails, null, 2));
      throw classified;
    }
  }

  /**
   * Verify the API key is valid by making a lightweight request.
   * Returns { valid: boolean, message: string }
   */
  async verifyApiKey() {
    try {
      await this.client.models.list();
      return { valid: true, message: 'API key is valid.' };
    } catch (error) {
      const status = getStatusCode(error);
      if (status === 401) {
        return { valid: false, message: 'API key is invalid or revoked.' };
      }
      if (status === 403) {
        return { valid: true, message: 'API key is valid but lacks permissions.' };
      }
      // For other errors (like 429 quota exceeded), the key is valid but quota is exhausted
      if (status === 429) {
        return { valid: true, message: 'API key is valid but quota has been exceeded.' };
      }
      return { valid: false, message: `API check failed: ${error.message}` };
    }
  }

  /**
   * Build conversation context from message history
   */
  buildMessages(systemPrompt, history, userMessage) {
    const messages = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Add conversation history (last 20 messages to manage context)
    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add current message
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }
}

module.exports = new OpenAIService();
