// user profile routes
// Heads up: Supabase handles auth. This file only reads/writes profile data in Mongo.

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { UserProfile } = require('../models');

const router = express.Router();

// simple helpers
const DEFAULT_TOOLS = ['pen', 'eraser', 'rectangle', 'circle', 'line', 'text'];
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

/**
 * Get the current user's profile.
 * If it's missing (first time user), we create a basic one from Supabase data.
 */
async function getOrCreateProfile(req) {
  let profile = await UserProfile.findById(req.userId);
  if (!profile) {
    // Create a new profile using Supabase user info
    profile = await UserProfile.syncFromSupabase({
      id: req.userId,
      email: req.userEmail,
      user_metadata: { display_name: req.userName },
    });
  }
  return profile;
}

/**
 * GET /api/profile/me
 * Return my profile.
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req);
    res.json({ profile });
  } catch (err) {
    console.error('profile:get me error:', err);
    res.status(500).json({ error: 'Sorry, we could not load your profile.' });
  }
});

/**
 * PUT /api/profile/me
 * Update basic profile fields (displayName, avatar).
 */
router.put('/me', authenticate, async (req, res) => {
  try {
    const { displayName, avatarUrl } = req.body;
    const profile = await getOrCreateProfile(req);

    if (displayName !== undefined) profile.displayName = displayName;
    if (avatarUrl !== undefined) profile.avatarUrl = avatarUrl;

    await profile.save();

    res.json({ message: 'Profile updated.', profile });
  } catch (err) {
    console.error('profile:update me error:', err);
    res.status(500).json({ error: 'Could not update your profile.' });
  }
});

/**
 * GET /api/profile/me/preferences
 * Return my editor preferences (tool, color, etc).
 */
router.get('/me/preferences', authenticate, async (req, res) => {
  try {
    const profile = await UserProfile.findById(req.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Try again in a moment.' });
    }
    res.json({ preferences: profile.preferences });
  } catch (err) {
    console.error('profile:get prefs error:', err);
    res.status(500).json({ error: 'Could not load your preferences.' });
  }
});

/**
 * PUT /api/profile/me/preferences
 * Update any provided preference fields (we don’t require all of them).
 */
router.put('/me/preferences', authenticate, async (req, res) => {
  try {
    const {
      defaultTool,
      defaultColor,
      defaultStrokeWidth,
      gridEnabled,
      autoSave,
      notificationsEnabled,
    } = req.body;

    const profile = await getOrCreateProfile(req);

    // only update what is provided (keep the rest as-is)
    if (defaultTool !== undefined) {
      // basic validation: keep current tool if incoming is invalid
      profile.preferences.defaultTool = DEFAULT_TOOLS.includes(defaultTool)
        ? defaultTool
        : profile.preferences.defaultTool; // TODO: maybe return a 400 later if invalid
    }

    if (defaultColor !== undefined) {
      // we just store the string as-is; UI can validate hex
      profile.preferences.defaultColor = String(defaultColor);
    }

    if (defaultStrokeWidth !== undefined) {
      const n = Number(defaultStrokeWidth);
      // min/max (1..20) so we don't end up with 1000px or something stroke width, or get negative number..
      profile.preferences.defaultStrokeWidth = clamp(
        Number.isFinite(n) ? Math.round(n) : profile.preferences.defaultStrokeWidth,
        1,
        20
      );
    }

    if (gridEnabled !== undefined) {
      profile.preferences.gridEnabled = Boolean(gridEnabled);
    }

    if (autoSave !== undefined) {
      profile.preferences.autoSave = Boolean(autoSave);
    }

    if (notificationsEnabled !== undefined) {
      profile.preferences.notificationsEnabled = Boolean(notificationsEnabled);
    }

    await profile.save();

    res.json({
      message: 'Preferences saved.',
      preferences: profile.preferences,
    });
  } catch (err) {
    console.error('profile:update prefs error:', err);
    res.status(500).json({ error: 'Could not save your preferences.' });
  }
});

/**
 * GET /api/profile/me/statistics
 * Return my basic usage stats for the app.
 */
router.get('/me/statistics', authenticate, async (req, res) => {
  try {
    const profile = await UserProfile.findById(req.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Try again in a moment.' });
    }
    res.json({ statistics: profile.statistics });
  } catch (err) {
    console.error('profile:get stats error:', err);
    res.status(500).json({ error: 'Could not load your statistics.' });
  }
});

/**
 * POST /api/profile/me/activity
 * Called by the client or middleware to bump lastActiveAt.
 */
router.post('/me/activity', authenticate, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req);
    await profile.recordActivity();
    res.json({ message: 'Activity recorded.' });
  } catch (err) {
    console.error('profile:record activity error:', err);
    res.status(500).json({ error: 'Could not record activity.' });
  }
});

/**
 * GET /api/profile/me/subscription
 * Return plan info (free/pro/enterprise + expiry).
 * That is, if we ever get to it.......
 */
router.get('/me/subscription', authenticate, async (req, res) => {
  try {
    const profile = await UserProfile.findById(req.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Try again in a moment.' });
    }
    res.json({ subscription: profile.subscription });
  } catch (err) {
    console.error('profile:get subscription error:', err);
    res.status(500).json({ error: 'Could not load your subscription.' });
  }
});

/**
 * GET /api/profile/:userId
 * Public profile view (minimal, no private fields).
 */
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const profile = await UserProfile.findById(req.params.userId)
      .select('displayName avatarUrl statistics.whiteboardsCreated statistics.lastActiveAt')
      .lean();

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    res.json({ profile });
  } catch (err) {
    console.error('profile:get public error:', err);
    res.status(500).json({ error: 'Could not load that profile.' });
  }
});

module.exports = router;
