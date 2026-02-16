import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    if (req.method === 'PUT') {
        const { amount } = req.body;
        if (amount === undefined) {
            return res.status(400).json({ error: 'Missing amount' });
        }

        try {
            const result = await pool.query(
                'UPDATE cash_outs SET amount = $1 WHERE id = $2 RETURNING *',
                [amount, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Cash-out not found' });
            }

            return res.status(200).json({ success: true, cashOut: result.rows[0] });
        } catch (error: any) {
            console.error('Update cash-out error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    } else if (req.method === 'DELETE') {
        try {
            const result = await pool.query(
                'DELETE FROM cash_outs WHERE id = $1 RETURNING *',
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Cash-out not found' });
            }

            return res.status(200).json({ success: true, message: 'Cash-out reverted' });
        } catch (error: any) {
            console.error('Delete cash-out error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}
