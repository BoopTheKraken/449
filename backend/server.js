// express + socket.io whiteboard server
// notes: auth is handled via Supabase JWT on sockets; HTTP uses middleware in routes.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

// optional redis (cache)
let redis;
try {
  redis = require('./config/redis');
} catch {
  console.log('Redis not configured; running without cache');
}

// express
const app = express();

// middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // If FRONTEND_URL is *, allow all origins (development mode)
      if (process.env.FRONTEND_URL === '*') {
        return callback(null, true);
      }

      // Otherwise, check if origin matches FRONTEND_URL
      const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
      if (origin === allowedOrigin) {
        return callback(null, true);
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json());

// serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend/build')));

// health
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    mongodb: mongoose.connection.readyState === 1,
    redis: redis?.status === 'ready',
    timestamp: new Date().toISOString(),
  });
});

// ==================== API ROUTES ====================

// note: no /api/auth; frontend uses Supabase
// haven't yet added actual api routes outside of connections

app.use('/api/whiteboards', require('./routes/whiteboards'));
app.use('/api/invitations', require('./routes/invitations'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/exports', require('./routes/exports'));

// serve React app for all other routes (must be after API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

// ==================== SERVER SETUP ====================

const server = http.createServer(app);

// socket.io
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin
      if (!origin) return callback(null, true);

      // If FRONTEND_URL is *, allow all origins (development mode)
      if (process.env.FRONTEND_URL === '*') {
        return callback(null, true);
      }

      // Otherwise, check if origin matches FRONTEND_URL
      const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
      if (origin === allowedOrigin) {
        return callback(null, true);
      }

      callback(null, false);
    },
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// ==================== CANVAS STATE CACHE ====================

// structure: Map<roomId, Array<event>>
const canvasStateCache = new Map();

const getCanvasState = (roomId) => {
  if (!canvasStateCache.has(roomId)) canvasStateCache.set(roomId, []);
  return canvasStateCache.get(roomId);
};

const clearCanvasState = (roomId) => {
  canvasStateCache.delete(roomId);
  console.log(`Canvas state cleared for room ${roomId}`);
};

// ==================== SOCKET.IO AUTH ====================

const { supabase } = require('./middleware/auth');

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication token required'));

    const { data, error } = await supabase.auth.getUser(token);
    const user = data?.user;
    if (error || !user) {
      console.error('Socket auth error:', error?.message || 'No user');
      return next(new Error('Invalid authentication token'));
    }

    socket.userId = user.id; // supabase uuid
    socket.userEmail = user.email;
    socket.userName =
      user.user_metadata?.display_name || user.email.split('@')[0];

    next();
  } catch (err) {
    console.error('Socket auth middleware error:', err);
    next(new Error('Authentication failed'));
  }
});

// ============== SOCKET.IO HANDLERS =============

const { Whiteboard, ChatMessage, Activity, Element } = require('./models');

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userName} (${socket.id})`);

  // join whiteboard room
  socket.on('join', async ({ roomId }) => {
    try {
      console.log(`[Join] ${socket.userName} (${socket.id}) attempting to join room: ${roomId}`);
      if (!roomId || typeof roomId !== 'string') {
        console.log('[Join] Invalid room id');
        return socket.emit('error', { message: 'Invalid room id' });
      }

      socket.join(roomId);
      console.log(`[Join] ${socket.userName} successfully joined room ${roomId}`);

      if (!mongoose.Types.ObjectId.isValid(roomId)) {
        // not a db-backed board (preview etc.)
        return;
      }

      await Whiteboard.updateOne(
        { _id: roomId },
        {
          $addToSet: {
            activeUsers: {
              userId: socket.userId,
              socketId: socket.id,
              joinedAt: new Date(),
              lastActivity: new Date(),
            },
          },
        }
      );

      socket.to(roomId).emit('user-joined', {
        userId: socket.userId,
        userName: socket.userName,
        socketId: socket.id,
      });

      const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
      console.log(`[Join] Room ${roomId} now has ${roomSize} users`);
      io.to(roomId).emit('room-info', { userCount: roomSize, roomId });

      // send cached canvas state to the joiner
      const currentState = getCanvasState(roomId);
      if (currentState.length > 0) {
        socket.emit('canvas-state', { roomId, events: currentState });
        console.log(
          `Sent ${currentState.length} cached events to ${socket.userName}`
        );
      }
    } catch (err) {
      console.error('Join room error:', err);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // draw
  socket.on('draw', (payload = {}) => {
    const { roomId } = payload;
    if (!roomId) return;

    const state = getCanvasState(roomId);
    state.push({ type: 'draw', ...payload });

    socket.to(roomId).emit('draw', payload);

    // update last activity
    Whiteboard.updateOne(
      { _id: roomId, 'activeUsers.socketId': socket.id },
      { $set: { 'activeUsers.$.lastActivity': new Date() } }
    ).catch((err) => console.error('Update activity error:', err));
  });

  // erase
  socket.on('erase', (payload = {}) => {
    const { roomId } = payload;
    if (!roomId) return;

    const state = getCanvasState(roomId);
    state.push({ type: 'erase', ...payload });

    socket.to(roomId).emit('erase', payload);
  });

  // shape
  socket.on('shape', (payload = {}) => {
    const { roomId } = payload;
    if (!roomId) return;

    const state = getCanvasState(roomId);
    state.push({ type: 'shape', ...payload });

    socket.to(roomId).emit('shape', payload);
  });

  // text (finalized)
  socket.on('text', (payload = {}) => {
    const { roomId } = payload;
    if (!roomId) return;

    const state = getCanvasState(roomId);
    state.push({ type: 'text', ...payload });

    socket.to(roomId).emit('text', payload);
  });

  // text typing (real-time, not saved to state)
  socket.on('text-typing', (payload = {}) => {
    const { roomId } = payload;
    if (!roomId) return;

    // Broadcast typing state to others with userId for tracking
    socket.to(roomId).emit('text-typing', {
      ...payload,
      userId: socket.userId,
    });
  });

  // text finalized (clear typing indicator)
  socket.on('text-finalized', (payload = {}) => {
    const { roomId } = payload;
    if (!roomId) return;

    socket.to(roomId).emit('text-finalized', {
      userId: socket.userId,
    });
  });

  // fill (paint bucket)
  socket.on('fill', (payload = {}) => {
    console.log(`[Fill] Received from ${socket.userName}:`, payload);
    const { roomId } = payload;
    if (!roomId) {
      console.log('[Fill] No roomId, ignoring');
      return;
    }

    const state = getCanvasState(roomId);
    state.push({ type: 'fill', ...payload });

    console.log(`[Fill] Broadcasting to room ${roomId}`);
    socket.to(roomId).emit('fill', payload);
    console.log(`[Fill] Broadcast complete`);
  });

  // selection cut (clear area when user cuts selection)
  socket.on('selection-cut', (payload = {}) => {
    console.log(`[Selection Cut] Received from ${socket.userName}:`, payload);
    const { roomId } = payload;
    if (!roomId) {
      console.log('[Selection Cut] No roomId, ignoring');
      return;
    }

    const state = getCanvasState(roomId);
    state.push({ type: 'selection-cut', ...payload });

    console.log(`[Selection Cut] Broadcasting to room ${roomId}`);
    socket.to(roomId).emit('selection-cut', payload);
    console.log(`[Selection Cut] Broadcast complete`);
  });

  // paste selection (cut/paste from selection tools)
  socket.on('paste-selection', (payload = {}) => {
    const { roomId } = payload;
    if (!roomId) return;

    const state = getCanvasState(roomId);
    state.push({ type: 'paste-selection', ...payload });

    socket.to(roomId).emit('paste-selection', payload);
  });

  // clear board (from client)
  socket.on('board-cleared', ({ roomId }) => {
    if (!roomId) return;
    clearCanvasState(roomId);
    socket.to(roomId).emit('board-cleared');
  });

  // board saved -> clear cache (bug fix: use clearCanvasState instead of roomState)
  socket.on('board-saved', ({ roomId }) => {
    try {
      if (!roomId) return;
      clearCanvasState(roomId);
      console.log(`Cleared cached events for room ${roomId} after save`);
    } catch (e) {
      console.error('board-saved handler error:', e);
    }
  });

  // board snapshot sync (peer-to-peer canvas sync)
  socket.on('board:request-sync', ({ roomId }) => {
    if (!roomId) return;
    // Broadcast to all other users in the room asking for a snapshot
    socket.to(roomId).emit('board:request-sync', { roomId });
    console.log(`${socket.userName} requested canvas sync for room ${roomId}`);
  });

  socket.on('board:load-snapshot', ({ roomId, img, bounds }) => {
    if (!roomId || !img) return;
    // Send the snapshot to all other users in the room
    socket.to(roomId).emit('board:load-snapshot', { roomId, img, bounds });
    console.log(`${socket.userName} sent canvas snapshot to room ${roomId}`);
  });

  // chat
  socket.on('chatMessage', async (msg = {}) => {
    try {
      const { roomId, text } = msg;
      if (!roomId || typeof text !== 'string' || text.trim().length === 0) {
        return socket.emit('error', { message: 'Invalid message format' });
      }

      const chatMessage = await ChatMessage.create({
        whiteboardId: roomId,
        userId: socket.userId,
        userName: socket.userName,
        text: text.trim(),
      });

      io.to(roomId).emit('chatMessage', {
        _id: chatMessage._id,
        user: socket.userName,
        userId: socket.userId,
        text: chatMessage.text,
        timestamp: chatMessage.createdAt,
      });

      console.log(`${socket.userName}: ${text.substring(0, 50)}...`);
    } catch (err) {
      console.error('Chat message error:', err);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // typing indicator
  socket.on('typing', ({ roomId, isTyping }) => {
    if (!roomId) return;
    io.to(roomId).emit('typing', {
      userId: socket.userId,
      userName: socket.userName,
      isTyping: Boolean(isTyping),
    });
  });

  // cursor position (client throttled)
  socket.on('cursor', ({ roomId, x, y }) => {
    if (!roomId) return;
    socket.to(roomId).emit('cursor-move', {
      userId: socket.userId,
      userName: socket.userName,
      x,
      y,
    });
  });

  // disconnect
  socket.on('disconnect', async (reason) => {
    try {
      console.log(`User disconnected: ${socket.userName} (${socket.id}) - ${reason}`);

      // rooms the socket was in (before disconnect removes them)
      const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
      console.log(`[Disconnect] ${socket.userName} was in rooms:`, rooms);

      // remove active user entries from database
      await Whiteboard.updateMany(
        { 'activeUsers.socketId': socket.id },
        { $pull: { activeUsers: { socketId: socket.id } } }
      );

      // notify and update counts for each room
      rooms.forEach((roomId) => {
        // Notify others that user left
        socket.to(roomId).emit('user-left', {
          userId: socket.userId,
          userName: socket.userName,
        });

        // Get current room size AFTER socket has disconnected
        const room = io.sockets.adapter.rooms.get(roomId);
        const roomSize = room?.size || 0;
        console.log(`[Disconnect] Room ${roomId} now has ${roomSize} users`);

        // Broadcast updated count to remaining users
        io.to(roomId).emit('room-info', { userCount: roomSize, roomId });
      });
    } catch (err) {
      console.error('Disconnect cleanup error:', err);
    }
  });

  // manual leave
  socket.on('leave', async ({ roomId }) => {
    try {
      if (!roomId) return;
      socket.leave(roomId);

      await Whiteboard.updateOne(
        { _id: roomId, 'activeUsers.socketId': socket.id },
        { $pull: { activeUsers: { socketId: socket.id } } }
      );

      socket.to(roomId).emit('user-left', {
        userId: socket.userId,
        userName: socket.userName,
      });

      console.log(`${socket.userName} left room ${roomId}`);
    } catch (err) {
      console.error('Leave room error:', err);
    }
  });
});

// =============== CLEANUP JOBS ==============

// stale connections (5 min)
setInterval(async () => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  try {
    const result = await Whiteboard.updateMany(
      {},
      { $pull: { activeUsers: { lastActivity: { $lt: fiveMinutesAgo } } } }
    );
    if (result.modifiedCount > 0) {
      console.log(`Cleaned ${result.modifiedCount} stale connections`);
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}, 5 * 60 * 1000);

// canvas cache monitor (10 min)
setInterval(() => {
  const roomCount = canvasStateCache.size;
  if (roomCount > 0) {
    console.log(`Active canvas caches: ${roomCount} rooms`);
    canvasStateCache.forEach((events, roomId) => {
      if (events.length > 500) {
        console.warn(`Large cache for room ${roomId}: ${events.length} events`);
      }
    });
  }
}, 10 * 60 * 1000);

// ==================== DATABASE ====================

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB connected: ${mongoose.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB error:', err);
    });
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
  }
};

// ==================== START ====================

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`Server running on port ${PORT}`);
    console.log(`MongoDB: Connected`);
    console.log(`Redis: ${redis?.status === 'ready' ? 'Connected' : 'Disabled'}`);
    console.log(`Socket.IO: Ready`);
    console.log(`Supabase Auth: Enabled`);
    console.log(`Canvas Sync: Enabled`);
    console.log('='.repeat(50));
  });
});

// ==================== SHUTDOWN ====================
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  console.log('\nShutting down gracefully...');

  // stop new connections
  server.close(() => {
    console.log('HTTP server closed');
  });

  // close sockets
  io.close(() => {
    console.log('Socket.IO closed');
  });

  // close mongodb
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (err) {
    console.error('Error closing MongoDB:', err);
  }

  // close redis
  if (redis && redis.status === 'ready') {
    redis.quit();
    console.log('Redis connection closed');
  }

  console.log('Goodbye.');
  process.exit(0);
}

// uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown();
});
