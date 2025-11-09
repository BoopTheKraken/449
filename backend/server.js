// server.js
// express + socket.io whiteboard server
// notes: auth is handled via Supabase JWT on sockets; HTTP uses middleware in routes.
// todo (later): verify room access server-side on join (owner/member/invite), not just trust the client.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
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
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());

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

app.use('/api/whiteboards', require('./routes/whiteboards'));
app.use('/api/invitations', require('./routes/invitations'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/exports', require('./routes/exports'));

// ==================== SERVER SETUP ====================

const server = http.createServer(app);

// socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
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

// ==================== SOCKET.IO HANDLERS ====================

const { Whiteboard, ChatMessage, Activity, Element } = require('./models');

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userName} (${socket.id})`);

  // join whiteboard room
  socket.on('join', async ({ roomId }) => {
    try {
      if (!roomId || typeof roomId !== 'string') {
        return socket.emit('error', { message: 'Invalid room id' });
      }

      socket.join(roomId);

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

  // text
  socket.on('text', (payload = {}) => {
    const { roomId } = payload;
    if (!roomId) return;

    const state = getCanvasState(roomId);
    state.push({ type: 'text', ...payload });

    socket.to(roomId).emit('text', payload);
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
      console.log(`User disconnected: ${socket.userName} (${reason})`);

      // rooms the socket was in
      const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);

      // remove active user entries
      await Whiteboard.updateMany(
        { 'activeUsers.socketId': socket.id },
        { $pull: { activeUsers: { socketId: socket.id } } }
      );

      // notify and update counts
      rooms.forEach((roomId) => {
        socket.to(roomId).emit('user-left', {
          userId: socket.userId,
          userName: socket.userName,
        });

        const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
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

// ==================== CLEANUP JOBS ====================

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
    console.log('API Routes:');
    console.log('   /api/whiteboards');
    console.log('   /api/invitations');
    console.log('   /api/profile');
    console.log('   /api/exports');
    console.log('='.repeat(50));
  });
});

// ==================== GRACEFUL SHUTDOWN ====================

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
