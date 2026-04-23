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
                online BOOLEAN DEFAULT false
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
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            UPDATE users SET online = false;
        `;

        client.query(initQueries, (err, result) => {
            release();
            if (err) {
                console.error('Error executing init queries', err.stack);
            }
        });
    }
});

module.exports = pool;
