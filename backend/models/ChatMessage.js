const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  whiteboardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Whiteboard',
    required: true,
    index: true
  },
  userId: {
    type: String, // Supabase user ID
    required: true
  },
  userName: {
    type: String, // Cached for display
    required: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 2000
  },
  reactions: [{
    userId: String,
    emoji: String,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries (ChatGPT suggestion/improvement)
chatMessageSchema.index({ whiteboardId: 1, createdAt: -1 });
chatMessageSchema.index({ whiteboardId: 1, userId: 1 });

// TTL index to auto-delete old messages after 90 days (optional)
// chatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// Method to get recent messages
chatMessageSchema.statics.getRecent = function(whiteboardId, limit = 50) {
  return this.find({ 
    whiteboardId, 
    isDeleted: false 
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();
};

// Method to add reaction (for chat, still need to test to make sure it works properly)
chatMessageSchema.methods.addReaction = function(userId, emoji) {
  // Remove existing reaction from this user first
  this.reactions = this.reactions.filter(r => r.userId !== userId);
  this.reactions.push({ userId, emoji });
  return this.save();
};

// Method to remove reaction
chatMessageSchema.methods.removeReaction = function(userId) {
  this.reactions = this.reactions.filter(r => r.userId !== userId);
  return this.save();
};

module.exports = mongoose.model('ChatMessage', chatMessageSchema);

// Most of the motheds here were used from sample chat in socket.io chat module.