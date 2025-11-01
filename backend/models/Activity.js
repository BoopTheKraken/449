const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  whiteboardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Whiteboard',
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true
  },
  action: {
    type: String,
    enum: ['created', 'joined', 'left', 'edited', 'invited', 'shared', 'exported', 'deleted'],
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Index for efficient activity log queries (ChatGPT suggestion/improvement)
activitySchema.index({ whiteboardId: 1, createdAt: -1 });
activitySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Activity', activitySchema);