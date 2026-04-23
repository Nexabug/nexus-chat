const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Error acquiring client', err.stack);
    } else {
        console.log('PostgreSQL Database connected');
        
        const initQueries = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                online BOOLEAN DEFAULT false,
                avatar_url TEXT,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS rooms (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                room VARCHAR(255) NOT NULL,
                username VARCHAR(255) NOT NULL,
                text TEXT NOT NULL,
                file_url TEXT,
                file_type VARCHAR(255),
                read_by TEXT DEFAULT '[]',
                is_edited BOOLEAN DEFAULT false,
                is_deleted BOOLEAN DEFAULT false,
                reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS reactions (
                id SERIAL PRIMARY KEY,
                message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
                username VARCHAR(255) NOT NULL,
                emoji VARCHAR(20) NOT NULL,
                UNIQUE(message_id, username, emoji)
            );

            CREATE TABLE IF NOT EXISTS pinned_messages (
                id SERIAL PRIMARY KEY,
                room VARCHAR(255) UNIQUE NOT NULL,
                message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE
            );

            ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS joined_rooms TEXT DEFAULT '["global"]';
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
            ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

            UPDATE users SET online = false;
        `;

        client.query(initQueries, (err, result) => {
            release();
            if (err) {
                console.error('Error executing init queries', err.stack);
            } else {
                console.log('Database schema initialized successfully');
            }
        });
    }
});

module.exports = pool;
