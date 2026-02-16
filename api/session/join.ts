import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { code, userId, role = 'player' } = req.body;

    if (!code || !userId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const client = await pool.connect();
        try {
            // Find session
            const sessionRes = await client.query('SELECT id, status FROM sessions WHERE session_code = $1', [code]);
            if (sessionRes.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }
            const session = sessionRes.rows[0];

            if (session.status === 'closed') {
                return res.status(403).json({ error: 'Session is closed' });
            }

            // Check if already joined
            const playerRes = await client.query(
                'SELECT * FROM session_players WHERE session_id = $1 AND user_id = $2',
                [session.id, userId]
            );

            if (playerRes.rows.length > 0) {
                // Already joined, return existing
                return res.status(200).json({ success: true, player: playerRes.rows[0] });
            }

            // Join
            const insertRes = await client.query(
                `INSERT INTO session_players (session_id, user_id, role) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
                [session.id, userId, role]
            );

            return res.status(201).json({ success: true, player: insertRes.rows[0], sessionId: session.id });
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('Join session error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
