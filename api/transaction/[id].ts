import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { id, type } = req.query; // Expect ?type=buyin or ?type=cashout

    // Fallback: if type is not in query, try to deteremine or check body? 
    // Ideally frontend should pass it. We'll enforce it for simplicity and performance.

    if (!type) {
        // Optimization: Frontend sends type. If not, we could search both tables but let's require it.
        // Actually, let's just assume we might need to check header or body if query missing.
        // For now, REQUIRED in query.
        return res.status(400).json({ error: 'Missing transaction type parameter (buyin/cashout)' });
    }

    try {
        if (req.method === 'PATCH') {
            // Status update (BuyIn only usually)
            if (type !== 'buyin') return res.status(400).json({ error: 'Status update only supported for buyins' });

            const { status } = req.body;
            if (!status) return res.status(400).json({ error: 'Missing status' });

            const result = await pool.query('UPDATE buy_ins SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
            if (result.rows.length === 0) return res.status(404).json({ error: 'Buy-in not found' });
            return res.status(200).json({ success: true, buyIn: result.rows[0] });

        } else if (req.method === 'PUT') {
            // Update Amount
            const { amount } = req.body;
            if (amount === undefined) return res.status(400).json({ error: 'Missing amount' });

            const table = type === 'buyin' ? 'buy_ins' : 'cash_outs';
            const result = await pool.query(
                `UPDATE ${table} SET amount = $1 WHERE id = $2 RETURNING *`,
                [amount, id]
            );
            if (result.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
            return res.status(200).json({ success: true, [type === 'buyin' ? 'buyIn' : 'cashOut']: result.rows[0] });

        } else if (req.method === 'DELETE') {
            const table = type === 'buyin' ? 'buy_ins' : 'cash_outs';
            const result = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [id]);
            if (result.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
            return res.status(200).json({ success: true, message: 'Transaction reverted' });

        } else {
            return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error: any) {
        console.error('Transaction update/delete error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
