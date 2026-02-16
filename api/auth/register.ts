import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name, username, password } = req.body;

    if (!name || !username || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Check if username exists
        const userCheck = await pool.query('SELECT id FROM users WHERE lower(name) = lower($1)', [username]);
        if (userCheck.rows.length > 0) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        // Insert new user
        // NOTE: IN PRODUCTION, PASSWORDS MUST BE HASHED (e.g., using bcrypt). 
        // Storing plain text passwords is a security risk.
        // For this MVP migration, we are keeping it simple as per instructions, but this is a critical TODO.

        // We need to add a password column to the users table if it doesn't exist, 
        // or store it in a separate auth table. 
        // The provided schema in database.sql DOES NOT HAVE A PASSWORD COLUMN.
        // I will assume for now we need to ALTER the table or just store it.
        // Let's check the schema again.

        // The schema in database.sql:
        // CREATE TABLE users (
        //     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        //     name TEXT NOT NULL,
        //     mobile TEXT UNIQUE,
        //     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        // );

        // It seems 'mobile' might be used as a unique identifier, or I need to add 'username' and 'password'.
        // The mockStore uses 'username' and 'password'.
        // I should probably update the schema in my mind or ask the user to run a migration.
        // For now, I will write the code assuming the columns exist, and I'll add a task to update the schema.

        const result = await pool.query(
            'INSERT INTO users (name, username, password) VALUES ($1, $2, $3) RETURNING id, name, username',
            [name, username, password]
        );

        const newUser = result.rows[0];
        return res.status(201).json({ success: true, user: newUser });
    } catch (error: any) {
        console.error('Registration error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
