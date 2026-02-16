import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { sessionId, userId, winnings } = req.body;

    if (!sessionId || !userId || winnings === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const result = await pool.query(
            'UPDATE session_players SET final_winnings = $1 WHERE session_id = $2 AND user_id = $3 RETURNING *',
            [winnings, sessionId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Player in session not found' });
        }

        return res.status(200).json({ success: true, player: result.rows[0] });
    } catch (error: any) {
        console.error('Update winnings error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
