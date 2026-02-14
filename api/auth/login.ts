import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Missing credentials' });
    }

    try {
        const result = await pool.query(
            'SELECT id, name, username FROM users WHERE lower(username) = lower($1) AND password = $2',
            [username, password]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const user = result.rows[0];
        return res.status(200).json({ success: true, user });
    } catch (error: any) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
