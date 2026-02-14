import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { id } = req.query; // Session ID from query or body? 
    // If filename is [id].ts under api/session/status is awkward.
    // Better: api/session/[id]/status.ts or simply use the body if it's a global action handler.
    // But Vercel routes file structure.

    // Let's assume this file is api/session/status.ts and receives sessionId in body.
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { sessionId, status } = req.body;

    if (!sessionId || !status) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const result = await pool.query(
            'UPDATE sessions SET status = $1, closed_at = CASE WHEN $1 = \'closed\' THEN NOW() ELSE closed_at END WHERE id = $2 RETURNING *',
            [status, sessionId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        return res.status(200).json({ success: true, session: result.rows[0] });
    } catch (error: any) {
        console.error('Update session status error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
