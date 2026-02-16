import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { sessionId, userId, amount } = req.body;

    if (!sessionId || !userId || !amount) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const result = await client.query(
                `INSERT INTO cash_outs (session_id, user_id, amount) 
                 VALUES ($1, $2, $3) 
                 RETURNING *`,
                [sessionId, userId, amount]
            );

            await client.query('COMMIT');

            return res.status(201).json({ success: true, cashOut: result.rows[0] });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('Cash-out error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
