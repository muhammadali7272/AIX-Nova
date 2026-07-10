const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    telegramId: {
      type: Number,
      required: true,
      unique: true,
    },
    model: {
      type: String,
      enum: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      default: 'gpt-4o',
    },
    temperature: {
      type: Number,
      min: 0,
      max: 2,
      default: 0.7,
    },
    maxTokens: {
      type: Number,
      min: 100,
      max: 16384,
      default: 2000,
    },
    systemPrompt: {
      type: String,
      default: 'You are AIX Nova, a helpful AI assistant. You provide clear, accurate, and friendly responses. You can analyze images, read files, and help with a wide variety of tasks.',
      maxlength: 3000,
    },
    language: {
      type: String,
      default: 'en',
      maxlength: 10,
    },
    notifications: {
      type: Boolean,
      default: true,
    },
    streamingEnabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

settingsSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Settings', settingsSchema);
