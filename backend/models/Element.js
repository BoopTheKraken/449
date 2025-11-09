const mongoose = require('mongoose');

const elementSchema = new mongoose.Schema({
  whiteboardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Whiteboard',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['pen', 'eraser', 'rectangle', 'circle', 'line', 'text', 'erase'],
    required: true
  },
  data: {
    from: {
      x: Number,
      y: Number
    },
    to: {
      x: Number,
      y: Number
    },
    text: String // for text elements
  },
  style: {
    color: String,
    strokeWidth: Number,
    fontSize: Number // for text elements
  },
  createdBy: {
    type: String,
    required: true
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Index for efficient queries (ChatGPT)
elementSchema.index({ whiteboardId: 1, createdAt: 1 });

module.exports = mongoose.model('Element', elementSchema);