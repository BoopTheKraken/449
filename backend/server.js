const express = require('express');
const http = require('http')
const cors = require('cors')
const { Server } = require('socket.io')

const app = express();

// TODO(Tatiana): tighten CORS before final (specific origins, methods). For now keep '*' so teammates aren’t blocked.
app.use(cors());

// Simple healthcheck so clients/monitors can probe readiness.
app.get('/health', (_, res) => res.json({ ok: true}));

const server = http.createServer(app);

// TODO(Tatiana): consider enabling perMessageDeflate for heavy rooms (bandwidth win for chat/history payloads).
// TODO(Tatiana): if rooms are added later, revisit CORS config per namespace.
const io = new Server(server, { cors: { origin: '*' } });

// TODO(Tatiana): rooms: when whiteboardId is available, emit a 'join' from client and call socket.join(whiteboardId).
// This prevents cross-talk between separate boards.
io.on('connection', (socket) => {
    // TODO(Tatiana): auth: accept a lightweight token/userId in handshake if permissions are needed (export/save).
    // TODO(Tatiana): presence: keep a room -> Set(socketId) map; on join/leave emit 'presence' {count} to room.
    // TODO(Tatiana): locks (MVP): in-memory map elementId -> { socketId, expiresAt }. Real version uses Redis SET NX EX.
    // TODO(Tatiana): use volatile for high-rate stroke traffic: socket.volatile.to(room).emit('draw', p) (drops frames under backpressure).
    // TODO(Tatiana): consider basic rate limiting per socket (draw bursts) to avoid flood.

    // Current broadcast (global). Once rooms exist, change to socket.to(roomId).emit(...)
    socket.on('draw', (p) => socket.broadcast.emit('draw', p));
    socket.on('erase', (p) => socket.broadcast.emit('erase', p));

    // TODO(Tatiana): support 'shape' finalize event (rect/circle/line) to reduce bandwidth vs streaming all segments.
    // socket.on('shape', (p) => socket.to(roomId).emit('shape', p));

    // TODO(Tatiana): presence: on 'join' => socket.join(roomId), update room set, emit 'presence' { count }.
    // socket.on('join', ({ roomId, userId }) => { /* join room + presence */ });

    // TODO(Tatiana): locks: 'startDrawing' -> try acquire; 'stopDrawing' -> release; deny/grant events back to requester.
    // socket.on('startDrawing', ({ elementId }) => { /* optimistic lock, 10s TTL */ });
    // socket.on('stopDrawing', ({ elementId }) => { /* release lock */ });

    // TODO(Tatiana): autosave queue (later with Redis):
    // - client emits 'autosave:delta' (small diffs or stroke batches)
    // - server LPUSH to Redis list whiteboard:{id}:pending
    // - background interval pulls LRANGE, batch writes to DB, DEL list
    // For now, keep client-side save/export as source of truth.

    // TODO(Tatiana): on disconnect: update presence; clean up any locks owned by this socket.
    // socket.on('disconnect', () => { /* presence--, release locks */ });
});

// TODO(Tatiana): config: PORT + allowed origins from env; add NODE_ENV checks for dev vs prod.
const PORT = process.env.PORT || 4000;

// TODO(Tatiana): logging: add basic request/connection logs, and error handlers (uncaughtException/unhandledRejection) with graceful shutdown.
server.listen(PORT, () => console.log(`Port API on: ${PORT}`));
