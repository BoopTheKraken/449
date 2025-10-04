const express = require('express');
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const redis = require('./config/redis')


const app = express();
app.use(cors());
app.get('/health', (_, res) => res.json({ ok: true}));

const server = http.createServer(app);
const io = new Server(server, {cors: {origin: '*'}});

io.on('connection', (socket) => {
    socket.on('draw', (p) => socket.broadcast.emit('draw', p));
    socket.on('erase', (p) => socket.broadcast.emit('erase', p));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Port API on: ${PORT}`));

//redis test
redis.set('testkey', 'Yo World!');
  redis.get('testkey').then(val => 
{
    console.log('value from redis =', val);
}).catch(err =>
{
    console.error('redis test error:', err);
});