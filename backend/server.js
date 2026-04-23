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
const ogs = require('open-graph-scraper');
const db = require('./database');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

const frontendOrigin = process.env.FRONTEND_URL || '*';

const io = new Server(server, {
  cors: {
    origin: frontendOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
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
    resource_type: 'auto',
  },
});
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in production.');
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-chat-app';
const onlineUsersMap = new Map();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Too many uploads, please wait a moment' }
});

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// ─── Auth Routes ────────────────────────────────────────────
app.post('/api/register', authLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.length < 2 || username.length > 30) return res.status(400).json({ error: 'Username must be 2-30 characters' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query(`INSERT INTO users (username, password) VALUES ($1, $2)`, [username, hashedPassword]);
        res.json({ message: 'User registered successfully' });
        io.emit('user_list_updated');
    } catch (err) {
        if (err.code === '23505') {
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

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, username: user.username, avatarUrl: user.avatar_url });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── Profile Update ─────────────────────────────────────────
app.patch('/api/profile', authenticateToken, async (req, res) => {
    const { avatarUrl } = req.body;
    const { username } = req.user;
    try {
        await db.query(`UPDATE users SET avatar_url = $1 WHERE username = $2`, [avatarUrl, username]);
        io.emit('user_list_updated');
        res.json({ message: 'Profile updated', avatarUrl });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── File Upload ─────────────────────────────────────────────
app.post('/api/upload', uploadLimiter, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const fileUrl = req.file.path;
    res.json({ fileUrl, fileType: req.file.mimetype });
});

// ─── User Directory ───────────────────────────────────────────
app.get('/api/users', async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT id, username, online, avatar_url, last_seen FROM users ORDER BY online DESC, username ASC`
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── Messages ─────────────────────────────────────────────────
app.get('/api/messages/:room', async (req, res) => {
    const room = req.params.room;
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;
    try {
        const { rows } = await db.query(
            `WITH paginated_messages AS (
                SELECT m.*, 
                    rm.text AS reply_text, rm.username AS reply_username, rm.file_url AS reply_file_url
                FROM messages m
                LEFT JOIN messages rm ON m.reply_to_id = rm.id
                WHERE m.room = $1 
                ORDER BY m.timestamp DESC 
                LIMIT $2 OFFSET $3
             )
             SELECT * FROM paginated_messages ORDER BY timestamp ASC`,
            [room, limit, offset]
        );
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

// ─── Link Preview ─────────────────────────────────────────────
app.get('/api/link-preview', async (req, res) => {
    const url = req.query.url;
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            return res.status(400).json({ error: 'Invalid URL protocol' });
        }

        const options = { url, timeout: 5000 };
        const { error, result } = await ogs(options);

        if (error) {
            return res.status(500).json({ error: 'Error fetching preview' });
        }

        res.json({
            title: result.ogTitle,
            description: result.ogDescription,
            image: result.ogImage?.[0]?.url,
            siteName: result.ogSiteName,
            favicon: result.favicon
        });
    } catch (err) {
        // Can fail on invalid URL or fetch errors
        return res.status(500).json({ error: 'Failed to fetch link preview' });
    }
});

// ─── Message Reactions ────────────────────────────────────────
app.get('/api/messages/:room/reactions', async (req, res) => {
    const room = req.params.room;
    try {
        const { rows } = await db.query(
            `SELECT r.message_id, r.username, r.emoji 
             FROM reactions r
             JOIN messages m ON r.message_id = m.id
             WHERE m.room = $1`,
            [room]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── Message Search ───────────────────────────────────────────
app.get('/api/messages/:room/search', async (req, res) => {
    const { room } = req.params;
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    try {
        const { rows } = await db.query(
            `SELECT * FROM messages WHERE room = $1 AND text ILIKE $2 AND is_deleted = false ORDER BY timestamp DESC LIMIT 30`,
            [room, `%${q.trim()}%`]
        );
        res.json(rows.map(r => ({ ...r, read_by: JSON.parse(r.read_by || '[]') })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── Pinned Messages ──────────────────────────────────────────
app.get('/api/rooms/:room/pinned', async (req, res) => {
    const { room } = req.params;
    try {
        const { rows } = await db.query(
            `SELECT m.* FROM pinned_messages pm JOIN messages m ON pm.message_id = m.id WHERE pm.room = $1`,
            [room]
        );
        if (rows.length === 0) return res.json(null);
        const msg = rows[0];
        res.json({ ...msg, read_by: JSON.parse(msg.read_by || '[]') });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── Room Media Gallery ───────────────────────────────────────
app.get('/api/rooms/:room/media', async (req, res) => {
    const { room } = req.params;
    const { type } = req.query; // 'image', 'video', 'document'
    try {
        let query = `
            SELECT id, username, file_url, file_type, timestamp
            FROM messages
            WHERE room = $1
              AND file_url IS NOT NULL
              AND file_url != ''
              AND is_deleted = false
        `;
        const params = [room];

        if (type === 'image') {
            query += ` AND file_type ILIKE 'image/%'`;
        } else if (type === 'video') {
            query += ` AND file_type ILIKE 'video/%'`;
        } else if (type === 'document') {
            query += ` AND file_type NOT ILIKE 'image/%' AND file_type NOT ILIKE 'video/%'`;
        }

        query += ` ORDER BY timestamp DESC LIMIT 200`;

        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── Room Management ──────────────────────────────────────────
app.post('/api/rooms/details', async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.json([]);
    try {
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        const { rows } = await db.query(`SELECT id, name FROM rooms WHERE id IN (${placeholders})`, ids);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.patch('/api/rooms/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Name is required' });
    try {
        await db.query(
            `INSERT INTO rooms (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = $2`,
            [id, name.trim()]
        );
        io.to(id).emit('room_updated', { id, name: name.trim() });
        res.json({ id, name: name.trim() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── Room Stats ──────────────────────────────────────────────
app.get('/api/rooms/:room/stats', async (req, res) => {
    const { room } = req.params;
    try {
        // Messages today
        const { rows: msgCount } = await db.query(
            `SELECT COUNT(*) FROM messages WHERE room = $1 AND timestamp > NOW() - INTERVAL '24 hours' AND is_deleted = false`,
            [room]
        );
        
        // Active members today
        const { rows: activeCount } = await db.query(
            `SELECT COUNT(DISTINCT username) FROM messages WHERE room = $1 AND timestamp > NOW() - INTERVAL '24 hours' AND is_deleted = false`,
            [room]
        );

        // Top contributors
        const { rows: topMembers } = await db.query(
            `SELECT username, COUNT(*) as count 
             FROM messages 
             WHERE room = $1 AND timestamp > NOW() - INTERVAL '24 hours' AND is_deleted = false
             GROUP BY username 
             ORDER BY count DESC 
             LIMIT 5`,
            [room]
        );

        // Hourly activity for the last 24 hours
        // We generate a series of hours to ensure we have all 24 even if some are empty
        const { rows: hourlyActivity } = await db.query(
            `WITH hours AS (
                SELECT generate_series(date_trunc('hour', NOW() - INTERVAL '23 hours'), date_trunc('hour', NOW()), '1 hour') as hour
            )
            SELECT 
                to_char(h.hour, 'HH24:00') as label,
                COUNT(m.id) as count
            FROM hours h
            LEFT JOIN messages m ON date_trunc('hour', m.timestamp) = h.hour 
                AND m.room = $1 
                AND m.is_deleted = false
            GROUP BY h.hour
            ORDER BY h.hour ASC`,
            [room]
        );

        res.json({
            messagesToday: parseInt(msgCount[0].count),
            activeMembersToday: parseInt(activeCount[0].count),
            topMembers,
            hourlyActivity
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── Room Persistence ──────────────────────────────────────────
app.get('/api/rooms/joined', authenticateToken, async (req, res) => {
    try {
        const { rows } = await db.query(`SELECT joined_rooms FROM users WHERE username = $1`, [req.user.username]);
        res.json(JSON.parse(rows[0].joined_rooms || '["global"]'));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.put('/api/rooms/joined', authenticateToken, async (req, res) => {
    const { rooms } = req.body;
    try {
        await db.query(`UPDATE users SET joined_rooms = $1 WHERE username = $2`, [JSON.stringify(rooms), req.user.username]);
        res.json({ message: 'Joined rooms updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── Socket.io Real-time ──────────────────────────────────────

const emitRoomMembers = (room) => {
    const clients = io.sockets.adapter.rooms.get(room);
    if (!clients) return io.to(room).emit('room_members', { room, members: [] });
    
    const members = new Set();
    for (const clientId of clients) {
        const uname = onlineUsersMap.get(clientId);
        if (uname) members.add(uname);
    }
    io.to(room).emit('room_members', { room, members: Array.from(members) });
};

io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
        return next(new Error('Authentication error'));
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Authentication error'));
        socket.user = decoded;
        next();
    });
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id} (${socket.user.username})`);

    socket.on('set_online', async (username) => {
        onlineUsersMap.set(socket.id, username);
        try {
            await db.query(`UPDATE users SET online = true, last_seen = NOW() WHERE username = $1`, [username]);
            io.emit('user_status_change', { username, online: true });
            
            // Re-emit members for all rooms this socket is in
            for (const room of socket.rooms) {
                emitRoomMembers(room);
            }
        } catch (err) { console.error(err); }
    });

    socket.on('join_room', (data) => {
        const { room, username } = data;
        socket.join(room);
        console.log(`User ${username} joined room: ${room}`);
        emitRoomMembers(room);
    });

    socket.on('leave_room', (data) => {
        const { room } = data;
        socket.leave(room);
        emitRoomMembers(room);
    });

    const handleNexusBotCommand = async (room, text, io) => {
        const botUsername = 'Nexus Bot';
        const lowerText = text.toLowerCase();
        let botResponse = '';

        if (lowerText.includes('@nexus summarize this room')) {
            try {
                // Fetch last 20 messages for summary mock
                const { rows } = await db.query(
                    `SELECT username, text FROM messages WHERE room = $1 AND is_deleted = false ORDER BY timestamp DESC LIMIT 20`,
                    [room]
                );
                const participants = new Set();
                rows.forEach(r => participants.add(r.username));
                botResponse = `(Offline Mode) Summary: This room has been active with ${rows.length} recent messages from participants including ${Array.from(participants).join(', ')}. Since I don't have an API key, this is a simulated summary.`;
            } catch (err) {
                botResponse = `(Offline Mode) I tried to summarize the room, but encountered an error.`;
            }
        } else if (lowerText.includes('@nexus translate')) {
            const textToTranslate = text.replace(/@nexus translate/i, '').trim();
            botResponse = `(Offline Mode) Translation: "${textToTranslate}" -> "Bonjour! (simulated)"`;
        } else if (lowerText.includes('@nexus weather')) {
            botResponse = `(Offline Mode) The weather in Nexus City is 72°F and sunny with a slight chance of flying cars.`;
        } else {
            botResponse = `(Offline Mode) Beep boop! I am Nexus Bot. I am currently running in offline mode because my API key is not configured. I can respond to:\n- @nexus summarize this room\n- @nexus translate [text]\n- @nexus weather`;
        }

        // Add a slight delay to make it feel natural
        setTimeout(async () => {
            try {
                const { rows } = await db.query(
                    `INSERT INTO messages (room, username, text, file_url, file_type, reply_to_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, timestamp`, 
                    [room, botUsername, botResponse, null, null, null]
                );
                
                const botMessageObj = { 
                    id: rows[0].id, room, username: botUsername, text: botResponse, 
                    file_url: null, file_type: null, read_by: [],
                    is_edited: false, is_deleted: false, 
                    reply_to_id: null, reply_text: null, reply_username: null, reply_file_url: null,
                    timestamp: rows[0].timestamp 
                };
                io.to(room).emit('receive_message', botMessageObj);
            } catch (err) { console.error('Bot Error:', err); }
        }, 1500);
    };

    socket.on('send_message', async (data) => {
        const { room, username, text, file_url, file_type, reply_to_id } = data;
        try {
            const { rows } = await db.query(
                `INSERT INTO messages (room, username, text, file_url, file_type, reply_to_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, timestamp`, 
                [room, username, text, file_url, file_type, reply_to_id || null]
            );
            
            let replyData = null;
            if (reply_to_id) {
                const { rows: replyRows } = await db.query(`SELECT text, username, file_url FROM messages WHERE id = $1`, [reply_to_id]);
                if (replyRows.length > 0) replyData = replyRows[0];
            }

            const messageObj = { 
                id: rows[0].id, room, username, text, 
                file_url, file_type, read_by: [],
                is_edited: false, is_deleted: false, 
                reply_to_id: reply_to_id || null,
                reply_text: replyData?.text || null,
                reply_username: replyData?.username || null,
                reply_file_url: replyData?.file_url || null,
                timestamp: rows[0].timestamp 
            };
            io.to(room).emit('receive_message', messageObj);

            // Nexus Bot Interception
            if (text && text.toLowerCase().includes('@nexus')) {
                handleNexusBotCommand(room, text, io);
            }
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

    // Reactions
    socket.on('add_reaction', async (data) => {
        const { message_id, username, emoji, room } = data;
        try {
            await db.query(
                `INSERT INTO reactions (message_id, username, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                [message_id, username, emoji]
            );
            const { rows } = await db.query(`SELECT username, emoji FROM reactions WHERE message_id = $1`, [message_id]);
            io.to(room).emit('reactions_updated', { message_id, reactions: rows });
        } catch (err) { console.error(err); }
    });

    socket.on('remove_reaction', async (data) => {
        const { message_id, username, emoji, room } = data;
        try {
            await db.query(
                `DELETE FROM reactions WHERE message_id = $1 AND username = $2 AND emoji = $3`,
                [message_id, username, emoji]
            );
            const { rows } = await db.query(`SELECT username, emoji FROM reactions WHERE message_id = $1`, [message_id]);
            io.to(room).emit('reactions_updated', { message_id, reactions: rows });
        } catch (err) { console.error(err); }
    });

    // Pin Message
    socket.on('pin_message', async (data) => {
        const { message_id, room } = data;
        try {
            await db.query(
                `INSERT INTO pinned_messages (room, message_id) VALUES ($1, $2) ON CONFLICT (room) DO UPDATE SET message_id = $2`,
                [room, message_id]
            );
            const { rows } = await db.query(`SELECT m.* FROM messages m WHERE m.id = $1`, [message_id]);
            if (rows.length > 0) {
                io.to(room).emit('message_pinned', { ...rows[0], read_by: JSON.parse(rows[0].read_by || '[]') });
            }
        } catch (err) { console.error(err); }
    });

    socket.on('unpin_message', async (data) => {
        const { room } = data;
        try {
            await db.query(`DELETE FROM pinned_messages WHERE room = $1`, [room]);
            io.to(room).emit('message_unpinned', { room });
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

    socket.on('disconnecting', () => {
        for (const room of socket.rooms) {
            // Delay slightly to let the socket actually leave the room in the adapter
            setTimeout(() => {
                emitRoomMembers(room);
            }, 100);
        }
    });

    socket.on('disconnect', async () => {
        console.log(`User disconnected: ${socket.id}`);
        const username = onlineUsersMap.get(socket.id);
        if (username) {
            onlineUsersMap.delete(socket.id);
            let isStillOnline = false;
            for (let [id, user] of onlineUsersMap.entries()) {
                if (user === username) { isStillOnline = true; break; }
            }
            if (!isStillOnline) {
                try {
                    await db.query(`UPDATE users SET online = false, last_seen = NOW() WHERE username = $1`, [username]);
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
