// whiteboards API
// access: authenticate -> checkWhiteboardAccess -> requireRole
// scope: CRUD, members, activity, batch element saves

const express = require('express');
const { authenticate, checkWhiteboardAccess, requireRole } = require('../middleware/auth');
const Whiteboard = require('../models/Whiteboard');
const Element = require('../models/Element');
const Activity = require('../models/Activity');
const Invitation = require('../models/Invitation');

const router = express.Router();

// small helpers
const toLower = (v) => (typeof v === 'string' ? v.toLowerCase() : '');
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

const HIDDEN_STATUSES = ['deleted', 'archived'];
const DEFAULT_ACTIVITY_LIMIT = 50;
const MAX_ACTIVITY_LIMIT = 200;

/**
 * GET /api/whiteboards
 * list whiteboards I own or joined
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { status } = req.query;

    const query = {
      $or: [{ ownerId: req.userId }, { 'members.userId': req.userId }],
    };

    query.status = status ? status : { $nin: HIDDEN_STATUSES };

    const whiteboards = await Whiteboard.find(query)
      .sort({ lastModified: -1 })
      .select('title status ownerId members createdAt lastModified settings')
      .lean();

    res.json({ whiteboards });
  } catch (err) {
    console.error('whiteboards:list error:', err);
    res.status(500).json({ error: 'Could not load your whiteboards right now.' });
  }
});

/**
 * GET /api/whiteboards/:id
 * fetch one whiteboard + elements + your permissions
 */
router.get('/:id', authenticate, checkWhiteboardAccess, async (req, res) => {
  try {
    const elements = await Element.find({ whiteboardId: req.params.id })
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      whiteboard: req.whiteboard,
      elements,
      permissions: {
        role: req.userRole,
        canEdit: ['owner', 'editor'].includes(req.userRole),
        canDelete: req.userRole === 'owner',
        canInvite: req.userRole === 'owner',
      },
    });
  } catch (err) {
    console.error('whiteboards:get error:', err);
    res.status(500).json({ error: 'Could not load that whiteboard.' });
  }
});

/**
 * POST /api/whiteboards
 * create a new whiteboard (owner = me)
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, settings } = req.body;

    const whiteboard = new Whiteboard({
      title: (title || '').trim() || 'Untitled Whiteboard',
      ownerId: req.userId,
      status: 'draft',
      members: [
        {
          userId: req.userId,
          role: 'owner',
          addedAt: new Date(),
        },
      ],
      settings: {
        isPublic: true,
        allowAnonymous: false,
        ...(settings || {}),
      },
    });

    await whiteboard.save();

    await Activity.create({
      whiteboardId: whiteboard._id,
      userId: req.userId,
      action: 'created',
      details: { title: whiteboard.title },
    });

    // middleware can attach req.profile; if present, bump stat
    if (req.profile?.incrementWhiteboardsCreated) {
      await req.profile.incrementWhiteboardsCreated();
    }

    res.status(201).json({
      message: 'Whiteboard created.',
      whiteboard,
    });
  } catch (err) {
    console.error('whiteboards:create error:', err);
    res.status(500).json({ error: 'Could not create the whiteboard.' });
  }
});

/**
 * PUT /api/whiteboards/:id
 * update title/status; owners can also update settings
 */
router.put(
  '/:id',
  authenticate,
  checkWhiteboardAccess,
  requireRole('owner', 'editor'),
  async (req, res) => {
    try {
      const { title, status, settings } = req.body;

      if (title !== undefined) req.whiteboard.title = title;
      if (status !== undefined) req.whiteboard.status = status;

      // owner-only bit
      if (settings !== undefined && req.userRole === 'owner') {
        req.whiteboard.settings = {
          ...req.whiteboard.settings,
          ...settings,
        };
      }

      req.whiteboard.lastModified = new Date();
      await req.whiteboard.save();

      await Activity.create({
        whiteboardId: req.whiteboard._id,
        userId: req.userId,
        action: 'edited',
        details: { changes: { title, status, settings } },
      });

      res.json({
        message: 'Whiteboard updated.',
        whiteboard: req.whiteboard,
      });
    } catch (err) {
      console.error('whiteboards:update error:', err);
      res.status(500).json({ error: 'Could not update the whiteboard.' });
    }
  }
);

/**
 * DELETE /api/whiteboards/:id
 * soft-delete (archive)
 */
router.delete(
  '/:id',
  authenticate,
  checkWhiteboardAccess,
  requireRole('owner'),
  async (req, res) => {
    try {
      req.whiteboard.status = 'archived';
      await req.whiteboard.save();

      await Activity.create({
        whiteboardId: req.whiteboard._id,
        userId: req.userId,
        action: 'deleted',
      });

      res.json({ message: 'Whiteboard archived.' });
    } catch (err) {
      console.error('whiteboards:archive error:', err);
      res.status(500).json({ error: 'Could not archive the whiteboard.' });
    }
  }
);

/**
 * DELETE /api/whiteboards/:id/permanent
 * hard-delete (owner only)
 */
router.delete(
  '/:id/permanent',
  authenticate,
  checkWhiteboardAccess,
  requireRole('owner'),
  async (req, res) => {
    try {
      await Element.deleteMany({ whiteboardId: req.whiteboard._id });
      await Activity.deleteMany({ whiteboardId: req.whiteboard._id });
      await Whiteboard.deleteOne({ _id: req.whiteboard._id });

      res.json({ message: 'Whiteboard permanently deleted.' });
    } catch (err) {
      console.error('whiteboards:hard-delete error:', err);
      res.status(500).json({ error: 'Could not delete the whiteboard.' });
    }
  }
);

/**
 * POST /api/whiteboards/:id/invite
 * owner invites a collaborator by email (editor|viewer)
 */
router.post(
  '/:id/invite',
  authenticate,
  checkWhiteboardAccess,
  requireRole('owner'),
  async (req, res) => {
    try {
      const { email, role = 'viewer', message } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required.' });

      if (!['editor', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Role must be "editor" or "viewer".' });
      }

      const emailLc = toLower(email);

      // quick member check (by userId or stored member email)
      const isMember =
        (req.whiteboard.members || []).some((m) => m.userId === emailLc) ||
        (req.whiteboard.members || []).some((m) => toLower(m.email) === emailLc);

      if (isMember) {
        return res.status(400).json({ error: 'That user is already a member.' });
      }

      const invitation = await Invitation.create({
        whiteboardId: req.whiteboard._id,
        senderId: req.userId,
        recipientEmail: emailLc,
        role,
        message,
        token: Invitation.generateToken(),
      });

      await Activity.create({
        whiteboardId: req.whiteboard._id,
        userId: req.userId,
        action: 'invited',
        details: { recipientEmail: email, role },
      });

      // (email service TBD)
      const inviteUrl = `${process.env.APP_URL || 'http://localhost:3000'}/invite/${invitation.token}`;

      res.status(201).json({
        message: 'Invitation created.',
        invitation: {
          id: invitation._id,
          recipientEmail: invitation.recipientEmail,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        },
        inviteUrl,
      });
    } catch (err) {
      console.error('whiteboards:invite error:', err);
      res.status(500).json({ error: 'Could not create an invitation.' });
    }
  }
);

/**
 * DELETE /api/whiteboards/:id/members/:userId
 * owner removes a member (cannot remove owner)
 */
router.delete(
  '/:id/members/:userId',
  authenticate,
  checkWhiteboardAccess,
  requireRole('owner'),
  async (req, res) => {
    try {
      const memberUserId = req.params.userId;

      if (memberUserId === req.whiteboard.ownerId) {
        return res.status(400).json({ error: 'Owner cannot be removed.' });
      }

      req.whiteboard.members = (req.whiteboard.members || []).filter(
        (m) => m.userId !== memberUserId
      );
      await req.whiteboard.save();

      await Activity.create({
        whiteboardId: req.whiteboard._id,
        userId: req.userId,
        action: 'edited',
        details: { removedMember: memberUserId },
      });

      res.json({ message: 'Member removed.' });
    } catch (err) {
      console.error('whiteboards:remove-member error:', err);
      res.status(500).json({ error: 'Could not remove that member.' });
    }
  }
);

/**
 * GET /api/whiteboards/:id/activity?limit=50
 * most recent activity (cap limit)
 */
router.get(
  '/:id/activity',
  authenticate,
  checkWhiteboardAccess,
  async (req, res) => {
    try {
      const rawLimit = parseInt(req.query.limit, 10);
      const limit = clamp(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_ACTIVITY_LIMIT, 1, MAX_ACTIVITY_LIMIT);

      const activities = await Activity.find({ whiteboardId: req.params.id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      res.json({ activities });
    } catch (err) {
      console.error('whiteboards:activity error:', err);
      res.status(500).json({ error: 'Could not load the activity log.' });
    }
  }
);

/**
 * POST /api/whiteboards/:id/elements
 * batch save elements from the canvas
 */
router.post(
  '/:id/elements',
  authenticate,
  checkWhiteboardAccess,
  requireRole('owner', 'editor'),
  async (req, res) => {
    try {
      const { elements } = req.body;
      if (!Array.isArray(elements) || elements.length === 0) {
        return res.status(400).json({ error: 'Elements array is required.' });
      }

      // minimal shaping-client enforces schema
      const toSave = elements.map((el) => ({
        ...el,
        whiteboardId: req.params.id,
        createdBy: req.userId,
      }));

      const saved = await Element.insertMany(toSave);

      req.whiteboard.lastModified = new Date();
      await req.whiteboard.save();

      res.status(201).json({
        message: 'Elements saved.',
        count: saved.length,
      });
    } catch (err) {
      console.error('whiteboards:elements-save error:', err);
      res.status(500).json({ error: 'Could not save elements.' });
    }
  }
);

module.exports = router;
