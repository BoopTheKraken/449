const mongoose = require('mongoose');

const whiteboardSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    default: 'Untitled Whiteboard'
  },
  ownerId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'shared', 'collaborative', 'archived'],
    default: 'draft'
  },
  members: [{
    userId: String,
    role: {
      type: String,
      enum: ['owner', 'editor', 'viewer'],
      default: 'viewer'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  activeUsers: [{
    userId: String,
    socketId: String,
    joinedAt: Date,
    lastActivity: Date
  }],
  settings: {
    isPublic: {
      type: Boolean,
      default: false
    },
    allowAnonymous: {
      type: Boolean,
      default: false
    }
  },
  lastModified: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries (ChatGPT suggestion/improvement)
whiteboardSchema.index({ ownerId: 1, createdAt: -1 });
whiteboardSchema.index({ 'members.userId': 1 });

module.exports = mongoose.model('Whiteboard', whiteboardSchema);