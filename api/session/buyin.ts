import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { sessionId, userId, amount, status = 'pending' } = req.body;

    if (!sessionId || !userId || !amount) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Check if user is already a player in this session
            const playerCheck = await client.query(
                'SELECT * FROM session_players WHERE session_id = $1 AND user_id = $2',
                [sessionId, userId]
            );

            if (playerCheck.rows.length === 0) {
                // User is not a player, auto-join them
                // We assume role 'player' for auto-joins via buy-in
                await client.query(
                    'INSERT INTO session_players (session_id, user_id, role) VALUES ($1, $2, $3)',
                    [sessionId, userId, 'player']
                );
            }

            // 2. Process the buy-in
            // Check if user is admin (creator) to auto-approve potentially
            // For now trust the 'status' passed if it's from a trusted source, 
            // but in a real app we should verify the caller has permissions to set 'approved'.
            // The frontend sends 'approved' if the current user is the admin adding their own stack.

            // We will blindly trust the frontend logic for MVP as per instructions, 
            // but adding a TODO for security.

            const result = await client.query(
                `INSERT INTO buy_ins (session_id, user_id, amount, status) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
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
    } catch (error: any) {
        console.error('Buy-in error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
