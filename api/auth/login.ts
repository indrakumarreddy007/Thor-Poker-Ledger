import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Missing credentials' });
    }

    try {
        // Try to authenticate with username or mobile
        // We handle potential missing column errors by catching them, but ideally we check both.
        // Since we don't know if 'username' or 'mobile' column exists, we can try robust logic
        // or just assume 'mobile' is the intended 'username' field based on legacy code.
        // However, checking both in one query is hard if column is missing.
        // Let's try the query assuming 'username' column exists (as per current code)
        // AND 'mobile' column exists. If one fails, the error will tell us.

        const result = await pool.query(
            'SELECT * FROM users WHERE (lower(username) = lower($1)) AND password = $2',
            [username, password]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const user = result.rows[0];
        // Ensure we don't return password
        const { password: _, ...safeUser } = user;
        return res.status(200).json({ success: true, user: safeUser });
    } catch (error: any) {
        console.error('Login error:', error);
        // Return actual error for debugging (remove in production if sensitive)
        return res.status(500).json({ error: `Login Failed: ${error.message}` });
    }
}
