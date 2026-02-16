import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { id } = req.query;

    if (req.method !== 'PATCH' && req.method !== 'PUT') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { status } = req.body;

    if (!id || !status) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const result = await pool.query(
            'UPDATE buy_ins SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Buy-in not found' });
        }

        return res.status(200).json({ success: true, buyIn: result.rows[0] });
    } catch (error: any) {
        console.error('Update buy-in status error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
