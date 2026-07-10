const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    telegramId: {
      type: Number,
      required: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    tokens: {
      prompt: { type: Number, default: 0, min: 0 },
      completion: { type: Number, default: 0, min: 0 },
      total: { type: Number, default: 0, min: 0 },
    },
    model: {
      type: String,
      default: 'gpt-4o',
    },
    metadata: {
      imageUrl: { type: String, default: '' },
      fileName: { type: String, default: '' },
      fileType: { type: String, default: '' },
      messageId: { type: Number },
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ userId: 1, createdAt: -1 });

messageSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Message', messageSchema);
