const express = require('express');
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
//const supabase = require('../config/supabaseClient')
//const dotenv = require('dotenv')
//const { createClient } = require('@supabase/supabase-js')
//const bodyParser = require('body-parser')
//const cookieParser = require('cookie-parser')

const app = express();
app.use(cors());
app.use(express.join())
app.get('/health', (_, res) => res.json({ ok: true}));

const server = http.createServer(app);
const io = new Server(server, {cors: {origin: '*'}});
//const superbase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_ANON_KEY)

//app.use(bodyParser.urlencoded({ extended: true}));
//app.use(cookieParser());
//app.use(express.static("public"));
//app.get("/", (req, res) => {
//    res.sendFile(path.join(__dirname, "public", "Login.jsx"));
//});

io.on('connection', (socket) => {
    socket.on('draw', (p) => socket.broadcast.emit('draw', p));
    socket.on('erase', (p) => socket.broadcast.emit('erase', p));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Port API on: ${PORT}`));