import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from './db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { type } = req.query; // ?type=login or ?type=register
    const action = type || req.body.action; // Support query or body

    try {
        if (action === 'login') {
            const { username, password } = req.body;
            if (!username || !password) {
                return res.status(400).json({ error: 'Missing credentials' });
            }

            const result = await pool.query(
                'SELECT id, name, username FROM users WHERE lower(username) = lower($1) AND password = $2',
                [username, password]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            const user = result.rows[0];
            return res.status(200).json({ success: true, user });

        } else if (action === 'register') {
            const { name, username, password } = req.body;
            if (!name || !username || !password) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Check if username exists
            const userCheck = await pool.query('SELECT id FROM users WHERE lower(name) = lower($1)', [username]);
            if (userCheck.rows.length > 0) {
                return res.status(409).json({ error: 'Username already taken' });
            }

            const result = await pool.query(
                'INSERT INTO users (name, username, password) VALUES ($1, $2, $3) RETURNING id, name, username',
                [name, username, password]
            );

            const newUser = result.rows[0];
            return res.status(201).json({ success: true, user: newUser });

        } else {
            return res.status(400).json({ error: 'Invalid action type. Use ?type=login or ?type=register' });
        }
    } catch (error: any) {
        console.error('Auth error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
