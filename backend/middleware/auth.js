// simple auth + access midleware for whiteboads
// we shouldn't be using REACT_APP_* envs. Using server-side names here

const {createClient} = require('@supabase/supabase-js');
const {UserProfile, Whiteboard, Invitation} = require('../models');

// supabase admin client (server only)
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.REACT_APP_SUPABASE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// some helpers
const toLower = (v) => (typeof v === 'string' ? v.toLowerCase() : '');
const getBearer = (header) => {
  if (!header) return null;
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return null;
  return token.trim();
};

/**
 * Supabase authentication
 */
async function authenticate(req, res, next) {
  try{
    const token = getBearer(req.headers.authorization);
    if(!token) {
      return res.status(401).json({ error: 'Authetication required. Please login'});
    }
    
    const {data, error } = await supabase.auth.getUser(token);
    const user = data?.user;
    if (error || !user){
      console.error('Auth error:', error?.message || 'No user');
      return res.status(401).json({ error: 'Invalid/expired token. Please login again'});
    }

    req.userId = user.id;
    req.userEmail = user.email;
    req.userName =
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      (user.email ? user.email.split('@')[0] : 'user');

    // load/create profile
    let profile = await UserProfile.findById(user.id);
    if(!profile) {
      profile = await UserProfile.syncFromSupabase(user);
      console.log(`profile created: ${user.email}`);
    }
    req.profile = profile;

    // record activity without blocking request
    profile
      .recordActivity()
      .catch((err) => console.error('recordActivity failed:',err));

    next();
  }catch (err) {
    console.error('authenticate error:', err);
    res.status(500).json({ error: 'Authentication failed. Please try again.'});
  }
}

// whiteboard access for current user
async function checkWhiteboardAccess(req, res, next) {
  try {
    const whiteboardId = req.params.id || req.body.whiteboardId || req.query.whiteboardId;

    if (!whiteboardId) {
      return res.status(400).json({ error: 'Whiteboard ID is required'});
    }

    const wb = await Whiteboard.findById(whiteboardId);
    if(!wb) {
      return res.status(404).json({error:'Whiteboard not found'});
    }

    const userId = req.userId;
    const userEmail = toLower(req.userEmail);
    const members = wb.members || [];

    const isOwner = wb.ownerId === userId;

    const isMemberById = members.some((m) => m.userId === userId);
    const isMemberByEmail= members.some((m)=> toLower(m.email) === userEmail);

    // invitation can grant access (pending or accepted)
    let hasInvitation = false;
    try {
      hasInvitation = await Invitation.exists({
        whiteboardId: wb._id,
        recipientEmail: userEmail,
        status: { $in: ['pending', 'accepted'] },
      });
    } catch (_) {
      // if invite lookup fails, don't crash access check
    }

    const isPublic = wb.settings?.isPublic === true;

    if (!(isOwner || isMemberById || isMemberByEmail || hasInvitation || isPublic)) {
      return res.status(403).json({ error: 'You do not have access to this whiteboard' });
    }

    // set role for downstream
    if (isOwner) {
      req.userRole = 'owner';
    } else {
      const member = members.find(
        (m) => m.userId === userId || toLower(m.email) === userEmail
      );
      req.userRole = member?.role || 'viewer';
    }

    req.whiteboard = wb;
    next();
  } catch (err) {
    console.error('checkWhiteboardAccess error:', err);
    res.status(500).json({ error: 'Access check failed' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.userRole) {
      return res
        .status(500)
        .json({ error: 'Internal error: userRole not set. Use checkWhiteboardAccess first.' });
    }

    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.userRole}`,
      });
    }

    next();
  };
}

// if we go with the subscription model (if we ever get to it)
function requirePremium(req, res, next) {
  if (!req.profile) {
    return res.status(500).json({ error: 'Internal error: profile not loaded' });
  }

  const plan = req.profile.subscription?.plan || '';
  const isPremium = plan === 'pro' || plan === 'enterprise';

  if (!isPremium) {
    return res.status(403).json({
      error: 'This feature requires a premium subscription',
      upgradeUrl: '/pricing',
    });
  }

  next();
}

module.exports = {
  supabase,
  authenticate,
  checkWhiteboardAccess,
  requireRole,
  requirePremium,
};