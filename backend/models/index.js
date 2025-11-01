
const Activity = require('./Activity');
const ChatMessage = require('./ChatMessage');
const Element = require('./Element');
const Export = require('./Export');
const Invitation = require('./Invitation');
const UserProfile = require('./UserProfile');
const Whiteboard = require('./Whiteboard');

// User authentication is handled by Supabase

module.exports = {
  Activity,
  ChatMessage,
  Element,
  Export,
  Invitation,
  UserProfile,
  Whiteboard
};