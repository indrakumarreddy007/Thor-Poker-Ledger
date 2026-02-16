import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from './db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { type } = req.query;
    const action = type || req.body.action;

    try {
        if (action === 'join') {
            const { code, userId, role = 'player' } = req.body;
            if (!code || !userId) return res.status(400).json({ error: 'Missing required fields' });

            const client = await pool.connect();
            try {
                const sessionRes = await client.query('SELECT id, status FROM sessions WHERE session_code = $1', [code]);
                if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
                const session = sessionRes.rows[0];
                if (session.status === 'closed') return res.status(403).json({ error: 'Session is closed' });

                const playerRes = await client.query('SELECT * FROM session_players WHERE session_id = $1 AND user_id = $2', [session.id, userId]);
                if (playerRes.rows.length > 0) return res.status(200).json({ success: true, player: playerRes.rows[0] });

                const insertRes = await client.query(
                    'INSERT INTO session_players (session_id, user_id, role) VALUES ($1, $2, $3) RETURNING *',
                    [session.id, userId, role]
                );
                return res.status(201).json({ success: true, player: insertRes.rows[0], sessionId: session.id });
            } finally {
                client.release();
            }

        } else if (action === 'settle') {
            const { sessionId, userId, winnings } = req.body;
            if (!sessionId || !userId || winnings === undefined) return res.status(400).json({ error: 'Missing required fields' });

            const result = await pool.query(
                'UPDATE session_players SET final_winnings = $1 WHERE session_id = $2 AND user_id = $3 RETURNING *',
                [winnings, sessionId, userId]
            );
            if (result.rows.length === 0) return res.status(404).json({ error: 'Player in session not found' });
            return res.status(200).json({ success: true, player: result.rows[0] });

        } else if (action === 'status') {
            const { sessionId, status } = req.body;
            if (!sessionId || !status) return res.status(400).json({ error: 'Missing required fields' });

            const result = await pool.query(
                "UPDATE sessions SET status = $1, closed_at = CASE WHEN $1 = 'closed' THEN NOW() ELSE closed_at END WHERE id = $2 RETURNING *",
                [status, sessionId]
            );
            if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
            return res.status(200).json({ success: true, session: result.rows[0] });

        } else {
            return res.status(400).json({ error: 'Invalid action type. Use ?type=join, settle, or status' });
        }
    } catch (error: any) {
        console.error('Action error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
