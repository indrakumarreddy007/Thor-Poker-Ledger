import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from './db.js';
import { randomUUID } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        // List all sessions
        try {
            const result = await pool.query('SELECT * FROM sessions ORDER BY created_at DESC');
            return res.status(200).json(result.rows);
        } catch (error: any) {
            console.error('Error fetching sessions:', error);
            return res.status(500).json({ error: 'Failed to fetch sessions' });
        }
    } else if (req.method === 'POST') {
        // Create a new session
        const { name, blindValue, createdBy } = req.body;

        if (!name || !blindValue || !createdBy) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        try {
            // Create session code
            const sessionCode = Math.random().toString(36).substr(2, 6).toUpperCase();

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // Create session
                const sessionResult = await client.query(
                    `INSERT INTO sessions (name, session_code, blind_value, created_by, status) 
           VALUES ($1, $2, $3, $4, 'active') 
           RETURNING *`,
                    [name, sessionCode, blindValue, createdBy]
                );
                const session = sessionResult.rows[0];

                // Add creator as admin
                await client.query(
                    `INSERT INTO session_players (session_id, user_id, role) 
           VALUES ($1, $2, 'admin')`,
                    [session.id, createdBy]
                );

                await client.query('COMMIT');
                return res.status(201).json(session);
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        } catch (error: any) {
            console.error('Error creating session:', error);
            return res.status(500).json({ error: `Failed to create session: ${error.message}` });
        }
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}
