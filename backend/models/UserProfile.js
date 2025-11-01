// user profile model
// stores Supabase-linked account info + user preferences + stats.

const mongoose = require('mongoose');

// define schema for user profile
const userProfileSchema = new mongoose.Schema(
  {
    _id: {
      type: String, // uses Supabase UUID as main id
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    avatarUrl: {
      type: String,
      default: null,
    },

    // preferences are mostly for UI defaults (tools, colors, etc.)
    preferences: {
      defaultTool: {
        type: String,
        enum: ['pen', 'eraser', 'rectangle', 'circle', 'line', 'text'],
        default: 'pen',
      },
      defaultColor: {
        type: String,
        default: '#000000',
      },
      defaultStrokeWidth: {
        type: Number,
        default: 2,
        min: 1,
        max: 20,
      },
      gridEnabled: {
        type: Boolean,
        default: true,
      },
      autoSave: {
        type: Boolean,
        default: true,
      },
      notificationsEnabled: {
        type: Boolean,
        default: true,
      },
    },

    // track basic usage stats
    statistics: {
      whiteboardsCreated: {
        type: Number,
        default: 0,
      },
      whiteboardsJoined: {
        type: Number,
        default: 0,
      },
      totalDrawingTime: {
        type: Number, // in minutes
        default: 0,
      },
      lastActiveAt: {
        type: Date,
        default: Date.now,
      },
    },

    // subscription plan (just placeholders for now)
    subscription: {
      plan: {
        type: String,
        enum: ['free', 'pro', 'enterprise'],
        default: 'free',
      },
      expiresAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true, // adds createdAt / updatedAt automatically
    _id: false, // because Supabase UUID is used as _id
  }
);

// indexes (helps find user quickly)
userProfileSchema.index({ email: 1 });
userProfileSchema.index({ 'statistics.lastActiveAt': -1 });

// static: sync from Supabase user object
// creates or updates the profile based on data from Supabase
userProfileSchema.statics.syncFromSupabase = async function (supabaseUser) {
  if (!supabaseUser?.id || !supabaseUser?.email) {
    throw new Error('Invalid Supabase user object');
  }

  // pull key fields out of Supabase user data
  const userData = {
    _id: supabaseUser.id,
    email: supabaseUser.email,
    displayName:
      supabaseUser.user_metadata?.display_name ||
      supabaseUser.email.split('@')[0],
    avatarUrl: supabaseUser.user_metadata?.avatar_url || null,
  };

  // upsert means: create if not exists, otherwise update existing
  // this also sets empty defaults for nested objects (optimized using ChatGPT)
  return this.findOneAndUpdate(
    { _id: supabaseUser.id },
    {
      $set: userData,
      $setOnInsert: {
        preferences: {},
        statistics: {},
        subscription: { plan: 'free' },
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
    }
  );
};

// instance methods
// record when user was last active
userProfileSchema.methods.recordActivity = async function () {
  this.statistics.lastActiveAt = new Date();
  return this.save();
};

// increment number of whiteboards created by user
userProfileSchema.methods.incrementWhiteboardsCreated = async function () {
  if (typeof this.statistics.whiteboardsCreated !== 'number') {
    this.statistics.whiteboardsCreated = 0;
  }
  this.statistics.whiteboardsCreated += 1;
  return this.save();
};

module.exports = mongoose.model('UserProfile', userProfileSchema);
