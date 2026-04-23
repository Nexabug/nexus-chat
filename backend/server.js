require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const rateLimit = require('express-rate-limit');
const db = require('./database');

const app = express();
app.set('trust proxy', 1); // Trust the first proxy (Render)
const server = http.createServer(app);

const frontendOrigin = process.env.FRONTEND_URL || '*';

const io = new Server(server, {
  cors: {
    origin: frontendOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.use(cors({ origin: frontendOrigin }));
app.use(express.json());

// Setup Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'chat_uploads',
    resource_type: 'auto', // allows audio/video/images
  },
});
const upload = multer({ storage: storage });

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in production.');
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-chat-app';
const onlineUsersMap = new Map();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});

// Auth Routes
app.post('/api/register', authLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query(`INSERT INTO users (username, password) VALUES ($1, $2)`, [username, hashedPassword]);
        res.json({ message: 'User registered successfully' });
        io.emit('user_list_updated');
    } catch (err) {
        if (err.code === '23505') { // Postgres unique constraint violation
            return res.status(400).json({ error: 'Username already exists' });
        }
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/login', authLimiter, async (req, res) => {
    const { username, password } = req.body;
    try {
        const { rows } = await db.query(`SELECT * FROM users WHERE username = $1`, [username]);
        const user = rows[0];
        
        if (!user) return res.status(400).json({ error: 'Invalid username or password' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: 'Invalid username or password' });

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, username: user.username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// File Upload Route
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    // multer-storage-cloudinary sets req.file.path to the cloudinary URL
    const fileUrl = req.file.path; 
    res.json({ fileUrl, fileType: req.file.mimetype });
});

// User Directory
app.get('/api/users', async (req, res) => {
    try {
        const { rows } = await db.query(`SELECT id, username, online FROM users ORDER BY online DESC, username ASC`);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Messages
app.get('/api/messages/:room', async (req, res) => {
    const room = req.params.room;
    try {
        const { rows } = await db.query(`SELECT * FROM messages WHERE room = $1 ORDER BY timestamp ASC LIMIT 200`, [room]);
        const messages = rows.map(r => ({
            ...r,
            read_by: JSON.parse(r.read_by || '[]')
        }));
        res.json(messages);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Socket.io for Real-time chat
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('set_online', async (username) => {
        onlineUsersMap.set(socket.id, username);
        try {
            await db.query(`UPDATE users SET online = true WHERE username = $1`, [username]);
            io.emit('user_status_change', { username, online: true });
        } catch (err) { console.error(err); }
    });

    socket.on('join_room', (data) => {
        const { room, username } = data;
        socket.join(room);
        console.log(`User ${username} joined room: ${room}`);
    });

    socket.on('send_message', async (data) => {
        const { room, username, text, file_url, file_type } = data;
        try {
            const { rows } = await db.query(
                `INSERT INTO messages (room, username, text, file_url, file_type) VALUES ($1, $2, $3, $4, $5) RETURNING id, timestamp`, 
                [room, username, text, file_url, file_type]
            );
            
            const messageObj = { 
                id: rows[0].id, room, username, text, 
                file_url, file_type, read_by: [],
                is_edited: false, is_deleted: false, timestamp: rows[0].timestamp 
            };
            io.to(room).emit('receive_message', messageObj);
        } catch (err) { console.error(err); }
    });

    // Typing Indicators
    socket.on('typing', (data) => {
        socket.to(data.room).emit('user_typing', { username: data.username, room: data.room });
    });

    socket.on('stop_typing', (data) => {
        socket.to(data.room).emit('user_stopped_typing', { username: data.username, room: data.room });
    });

    // Edit & Delete Messages
    socket.on('edit_message', async (data) => {
        try {
            const { rowCount } = await db.query(
                `UPDATE messages SET text = $1, is_edited = true WHERE id = $2 AND username = $3`, 
                [data.text, data.id, data.username]
            );
            if (rowCount > 0) {
                io.to(data.room).emit('message_edited', { id: data.id, text: data.text });
            }
        } catch (err) { console.error(err); }
    });

    socket.on('delete_message', async (data) => {
        try {
            const { rowCount } = await db.query(
                `UPDATE messages SET is_deleted = true WHERE id = $1 AND username = $2`, 
                [data.id, data.username]
            );
            if (rowCount > 0) {
                io.to(data.room).emit('message_deleted', { id: data.id });
            }
        } catch (err) { console.error(err); }
    });

    // Read Receipts
    socket.on('mark_read', async (data) => {
        const { messageIds, username, room } = data;
        if (!messageIds || messageIds.length === 0) return;

        try {
            const placeholders = messageIds.map((_, i) => `$${i + 1}`).join(',');
            const { rows } = await db.query(`SELECT id, read_by FROM messages WHERE id IN (${placeholders})`, messageIds);
            
            for (let row of rows) {
                let readers = JSON.parse(row.read_by || '[]');
                if (!readers.includes(username)) {
                    readers.push(username);
                    await db.query(`UPDATE messages SET read_by = $1 WHERE id = $2`, [JSON.stringify(readers), row.id]);
                    io.to(room).emit('message_read', { id: row.id, readers });
                }
            }
        } catch (err) { console.error(err); }
    });

    // WebRTC Signaling
    socket.on('call_user', (data) => {
        socket.to(data.room).emit('incoming_call', data);
    });

    socket.on('answer_call', (data) => {
        socket.to(data.room).emit('call_answered', data);
    });

    socket.on('ice_candidate', (data) => {
        socket.to(data.room).emit('ice_candidate', data);
    });

    socket.on('end_call', (data) => {
        socket.to(data.room).emit('call_ended', data);
    });

    socket.on('disconnect', async () => {
        console.log(`User disconnected: ${socket.id}`);
        const username = onlineUsersMap.get(socket.id);
        if (username) {
            onlineUsersMap.delete(socket.id);
            let isStillOnline = false;
            for (let [id, user] of onlineUsersMap.entries()) {
                if (user === username) {
                    isStillOnline = true;
                    break;
                }
            }
            if (!isStillOnline) {
                try {
                    await db.query(`UPDATE users SET online = false WHERE username = $1`, [username]);
                    io.emit('user_status_change', { username, online: false });
                } catch (err) { console.error(err); }
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
