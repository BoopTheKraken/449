const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema({
  whiteboardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Whiteboard',
    required: true,
    index: true
  },
  senderId: {
    type: String, // Supabase user ID
    required: true
  },
  recipientEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  recipientId: {
    type: String, // Supabase user ID if user exists
    default: null
  },
  role: {
    type: String,
    enum: ['editor', 'viewer'],
    required: true,
    default: 'viewer'
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'expired', 'cancelled'],
    default: 'pending',
    index: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  message: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Compound index for efficient queries (ChatGPT suggestion/improvement)
invitationSchema.index({ whiteboardId: 1, status: 1 });
invitationSchema.index({ recipientEmail: 1, status: 1 });

// auto-expire old invitations
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// virtual to check if invitation is still valid
invitationSchema.virtual('isValid').get(function() {
  return this.status === 'pending' && this.expiresAt > new Date();
});

// Method to generate unique token (ChatGPT suggestion/improvement)
invitationSchema.statics.generateToken = function() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
};

module.exports = mongoose.model('Invitation', invitationSchema);