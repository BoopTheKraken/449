const mongoose = require('mongoose');
// still needs to be implemented in UI

const exportSchema = new mongoose.Schema({
  whiteboardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Whiteboard',
    required: true,
    index: true
  },
  userId: {
    type: String, // Supabase user ID
    required: true,
    index: true
  },
  format: {
    type: String,
    enum: ['png', 'pdf', 'svg', 'json'],
    required: true
  },
  options: {
    resolution: String, // '1x', '2x', '4x' for PNG
    pageSize: String,   // 'A4', 'Letter', 'Custom' for PDF
    orientation: String, // 'portrait', 'landscape' for PDF
    compressed: Boolean, // for SVG
    includeMetadata: Boolean // for JSON
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number, // in bytes
    required: true
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing',
    index: true
  },
  error: {
    type: String,
    default: null
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  lastDownloadedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  },
  autoDelete: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
exportSchema.index({ userId: 1, createdAt: -1 });
exportSchema.index({ whiteboardId: 1, createdAt: -1 });
exportSchema.index({ status: 1, createdAt: -1 });

// TTL index to auto-delete expired exports
exportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual to check if export is still available
exportSchema.virtual('isAvailable').get(function() {
  return this.status === 'completed' && 
         this.expiresAt > new Date() &&
         this.fileUrl;
});

// Method to track download
exportSchema.methods.trackDownload = function() {
  this.downloadCount += 1;
  this.lastDownloadedAt = new Date();
  return this.save();
};

// Static method to get user's export quota usage
exportSchema.statics.getQuotaUsage = async function(userId, timeWindow = 24 * 60 * 60 * 1000) {
  const since = new Date(Date.now() - timeWindow);
  const count = await this.countDocuments({
    userId,
    createdAt: { $gte: since }
  });
  return count;
};

module.exports = mongoose.model('Export', exportSchema);