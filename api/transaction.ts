import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from './db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { type } = req.query;
    const action = type || req.body.type; // 'buyin' or 'cashout'

    try {
        if (action === 'buyin') {
            const { sessionId, userId, amount, status = 'pending' } = req.body;
            if (!sessionId || !userId || !amount) return res.status(400).json({ error: 'Missing required fields' });

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const playerCheck = await client.query('SELECT * FROM session_players WHERE session_id = $1 AND user_id = $2', [sessionId, userId]);
                if (playerCheck.rows.length === 0) {
                    await client.query('INSERT INTO session_players (session_id, user_id, role) VALUES ($1, $2, $3)', [sessionId, userId, 'player']);
                }
                const result = await client.query(
                    'INSERT INTO buy_ins (session_id, user_id, amount, status) VALUES ($1, $2, $3, $4) RETURNING *',
                    [sessionId, userId, amount, status]
                );
                await client.query('COMMIT');
                return res.status(201).json({ success: true, buyIn: result.rows[0] });
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }

        } else if (action === 'cashout') {
            const { sessionId, userId, amount } = req.body;
            if (!sessionId || !userId || !amount) return res.status(400).json({ error: 'Missing required fields' });

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const result = await client.query(
                    'INSERT INTO cash_outs (session_id, user_id, amount) VALUES ($1, $2, $3) RETURNING *',
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

        } else {
            return res.status(400).json({ error: 'Invalid transaction type. Use ?type=buyin or ?type=cashout' });
        }
    } catch (error: any) {
        console.error('Transaction error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
