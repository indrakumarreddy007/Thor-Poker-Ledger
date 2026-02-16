import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { id } = req.query;

    if (req.method === 'PATCH') {
        // Legacy support for status update, or specifically for status
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ error: 'Missing status' });
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
    } else if (req.method === 'PUT') {
        // Update amount
        const { amount } = req.body;
        if (amount === undefined) {
            return res.status(400).json({ error: 'Missing amount' });
        }
        try {
            const result = await pool.query(
                'UPDATE buy_ins SET amount = $1 WHERE id = $2 RETURNING *',
                [amount, id]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Buy-in not found' });
            }
            return res.status(200).json({ success: true, buyIn: result.rows[0] });
        } catch (error: any) {
            console.error('Update buy-in amount error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    } else if (req.method === 'DELETE') {
        try {
            const result = await pool.query(
                'DELETE FROM buy_ins WHERE id = $1 RETURNING *',
                [id]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Buy-in not found' });
            }
            return res.status(200).json({ success: true, message: 'Buy-in reverted' });
        } catch (error: any) {
            console.error('Delete buy-in error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}
