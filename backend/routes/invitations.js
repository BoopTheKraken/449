// invitations api routes
// default list shows pending invites. token route is public for invite links.
// auth is handled by Supabase; this API only manages invitation + membership stuff.

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { Invitation, Whiteboard, UserProfile, Activity } = require('../models');

const router = express.Router();

// small helpers
const toLower = (v) => (typeof v === 'string' ? v.toLowerCase() : '');
const now = () => new Date();
const isExpired = (expiresAt) => Boolean(expiresAt) && expiresAt < now();

// get all invitations for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const { status } = req.query;

    // only invitations sent to the logged-in email
    const query = {
      recipientEmail: toLower(req.userEmail),
      status: status || 'pending', // by default, show pending
    };

    const invitations = await Invitation.find(query)
      .populate('whiteboardId', 'title ownerId createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // keeping response shape the same
    res.json({ invitations });
  } catch (err) {
    console.error('get invitations error:', err);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// get single invitation by token (public)
// note: anyone with the link can preview, but no PII is returned
router.get('/:token', async (req, res) => {
  try {
    const invitation = await Invitation.findOne({ token: req.params.token })
      .populate('whiteboardId', 'title ownerId createdAt')
      .lean();

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // if expired, mark it and inform the user
    if (isExpired(invitation.expiresAt)) {
      await Invitation.updateOne({ _id: invitation._id }, { status: 'expired' });
      return res.status(410).json({ error: 'Invitation has expired' });
    }

    // don’t leak the raw token back out
    delete invitation.token;

    // keeping the same `res.json({ invitation })` shape
    res.json({ invitation });
  } catch (err) {
    console.error('get invitation error:', err);
    res.status(500).json({ error: 'Failed to fetch invitation' });
  }
});

// accept invitation
router.post('/:token/accept', authenticate, async (req, res) => {
  try {
    const invitation = await Invitation.findOne({
      token: req.params.token,
      status: 'pending',
    });

    if (!invitation) {
      return res
        .status(404)
        .json({ error: 'Invitation not found or already processed' });
    }

    // check expiry first
    if (isExpired(invitation.expiresAt)) {
      invitation.status = 'expired';
      await invitation.save();
      return res.status(410).json({ error: 'Invitation has expired' });
    }

    // only the invited email can accept (case-insensitive)
    if (toLower(invitation.recipientEmail) !== toLower(req.userEmail)) {
      return res
        .status(403)
        .json({ error: 'This invitation was sent to a different email address' });
    }

    // load whiteboard we’re joining
    const whiteboard = await Whiteboard.findById(invitation.whiteboardId);
    if (!whiteboard) {
      return res.status(404).json({ error: 'Whiteboard not found' });
    }

    // if already a member, just mark accepted and return
    const alreadyMember = Array.isArray(whiteboard.members)
      ? whiteboard.members.some((m) => m.userId === req.userId)
      : false;

    if (alreadyMember) {
      invitation.status = 'accepted';
      invitation.acceptedAt = now();
      await invitation.save();

      return res.json({
        message: 'You are already a member of this whiteboard',
        whiteboard: { id: whiteboard._id, title: whiteboard.title },
      });
    }

    // add as member (idempotent style: push only if missing)
    whiteboard.members = whiteboard.members || [];
    whiteboard.members.push({
      userId: req.userId,
      role: invitation.role,
      addedAt: now(),
    });

    // if it was draft, flip to shared on first collaboration
    if (whiteboard.status === 'draft') {
      whiteboard.status = 'shared';
    }

    await whiteboard.save();

    // mark invitation accepted
    invitation.status = 'accepted';
    invitation.recipientId = req.userId;
    invitation.acceptedAt = now();
    await invitation.save();

    // activity log for audit trail
    await Activity.create({
      whiteboardId: whiteboard._id,
      userId: req.userId,
      action: 'joined',
      details: { via: 'invitation', role: invitation.role },
    });

    // bump a simple stat on the user profile if it exists
    const profile = await UserProfile.findById(req.userId);
    if (profile) {
      profile.statistics.whiteboardsJoined =
        (profile.statistics.whiteboardsJoined || 0) + 1;
      await profile.save();
    }

    // keeping response shape the same
    res.json({
      message: 'Invitation accepted successfully',
      whiteboard: { id: whiteboard._id, title: whiteboard.title, role: invitation.role },
    });
  } catch (err) {
    console.error('accept invitation error:', err);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// decline invitation
router.post('/:token/decline', authenticate, async (req, res) => {
  try {
    const invitation = await Invitation.findOne({
      token: req.params.token,
      status: 'pending',
    });

    if (!invitation) {
      return res
        .status(404)
        .json({ error: 'Invitation not found or already processed' });
    }

    // must be the same recipient
    if (toLower(invitation.recipientEmail) !== toLower(req.userEmail)) {
      return res
        .status(403)
        .json({ error: 'This invitation was sent to a different email address' });
    }

    invitation.status = 'declined';
    await invitation.save();

    // log it (keeping your action style)
    await Activity.create({
      whiteboardId: invitation.whiteboardId,
      userId: req.userId,
      action: 'edited',
      details: { action: 'invitation_declined', recipientEmail: invitation.recipientEmail },
    });

    res.json({ message: 'Invitation declined' });
  } catch (err) {
    console.error('decline invitation error:', err);
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
});

// cancel invitation (only the sender can do this)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const invitation = await Invitation.findById(req.params.id);
    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.senderId !== req.userId) {
      return res
        .status(403)
        .json({ error: 'Only the sender can cancel this invitation' });
    }

    invitation.status = 'cancelled';
    await invitation.save();

    await Activity.create({
      whiteboardId: invitation.whiteboardId,
      userId: req.userId,
      action: 'edited',
      details: { action: 'invitation_cancelled', recipientEmail: invitation.recipientEmail },
    });

    res.json({ message: 'Invitation cancelled successfully' });
  } catch (err) {
    console.error('cancel invitation error:', err);
    res.status(500).json({ error: 'Failed to cancel invitation' });
  }
});

// resend invitation (sender only)
// gives a fresh token and extends expiry 7 days
router.post('/:id/resend', authenticate, async (req, res) => {
  try {
    const invitation = await Invitation.findById(req.params.id);
    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.senderId !== req.userId) {
      return res
        .status(403)
        .json({ error: 'Only the sender can resend this invitation' });
    }

    // only allow resend for pending/expired to keep things simple
    if (!['pending', 'expired'].includes(invitation.status)) {
      return res
        .status(400)
        .json({ error: 'Cannot resend invitation with status: ' + invitation.status });
    }

    // refresh token and extend expiry
    invitation.token = Invitation.generateToken();
    invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    invitation.status = 'pending';

    // normalize email just in case old records had mixed case
    if (invitation.recipientEmail) {
      invitation.recipientEmail = toLower(invitation.recipientEmail);
    }

    await invitation.save();

    // NOTE: emailing is a TODO; just return the link
    const inviteUrl = `${process.env.APP_URL || 'http://localhost:3000'}/invite/${invitation.token}`;

    // keeping the same response shape
    res.json({ message: 'Invitation resent successfully', inviteUrl });
  } catch (err) {
    console.error('resend invitation error:', err);
    res.status(500).json({ error: 'Failed to resend invitation' });
  }
});

module.exports = router;
