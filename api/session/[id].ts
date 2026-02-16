import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { id } = req.query; // This captures [id] from the filename

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!id) {
        return res.status(400).json({ error: 'Missing session ID' });
    }

    try {
        const client = await pool.connect();
        try {
            // Get session
            // Check if id is UUID or Code
            let sessionQuery = 'SELECT * FROM sessions WHERE id = $1';
            let sessionParams = [id];

            // simplistic check for UUID format (8-4-4-4-12)
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id as string);

            if (!isUuid) {
                sessionQuery = 'SELECT * FROM sessions WHERE session_code = $1';
            }

            const sessionResult = await client.query(sessionQuery, sessionParams);

            if (sessionResult.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            const session = sessionResult.rows[0];

            // Get players
            const playersResult = await client.query(
                `SELECT sp.*, u.name 
         FROM session_players sp 
         JOIN users u ON sp.user_id = u.id 
         WHERE sp.session_id = $1`,
                [session.id]
            );

            // Get buy-ins
            const buyInsResult = await client.query(
                `SELECT * FROM buy_ins WHERE session_id = $1 ORDER BY timestamp DESC`,
                [session.id]
            );

            return res.status(200).json({
                session,
                players: playersResult.rows,
                buyIns: buyInsResult.rows
            });
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('Error fetching session details:', error);
        return res.status(500).json({ error: `Failed to fetch session details: ${error.message}` });
    }
}
