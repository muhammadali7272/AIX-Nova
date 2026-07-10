const mongoose = require('mongoose');

const usageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    telegramId: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    tokens: {
      prompt: { type: Number, default: 0, min: 0 },
      completion: { type: Number, default: 0, min: 0 },
      total: { type: Number, default: 0, min: 0 },
    },
    messages: {
      type: Number,
      default: 0,
      min: 0,
    },
    images: {
      type: Number,
      default: 0,
      min: 0,
    },
    files: {
      type: Number,
      default: 0,
      min: 0,
    },
    responseTime: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

usageSchema.index({ userId: 1, date: -1 });
usageSchema.index({ telegramId: 1, date: -1 });
usageSchema.index({ date: -1 });

usageSchema.statics.getTodayStats = function () {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  return this.aggregate([
    { $match: { date: { $gte: start } } },
    {
      $group: {
        _id: null,
        uniqueUsers: { $addToSet: '$telegramId' },
        totalMessages: { $sum: '$messages' },
        totalPromptTokens: { $sum: '$tokens.prompt' },
        totalCompletionTokens: { $sum: '$tokens.completion' },
        totalTokens: { $sum: '$tokens.total' },
        totalImages: { $sum: '$images' },
        totalFiles: { $sum: '$files' },
        avgResponseTime: { $avg: '$responseTime' },
      },
    },
  ]);
};

usageSchema.statics.getPeriodStats = function (startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        users: { $addToSet: '$telegramId' },
        messages: { $sum: '$messages' },
        tokens: { $sum: '$tokens.total' },
        avgResponseTime: { $avg: '$responseTime' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

usageSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Usage', usageSchema);
