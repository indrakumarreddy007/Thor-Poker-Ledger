
import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId parameter' });
    }

    try {
        // Calculate stats:
        // 1. Get all sessions where user was a player
        // 2. Sum up buy-ins and winnings
        // For MVP, we can do a simple aggregation query if the schema supports it.
        // session_players table: session_id, user_id, final_winnings
        // buy_ins table: session_id, user_id, amount, status='approved'

        // Total Winnings
        const winningsRes = await pool.query(
            'SELECT COALESCE(SUM(final_winnings), 0) as total FROM session_players WHERE user_id = $1',
            [userId]
        );
        const totalWinnings = parseFloat(winningsRes.rows[0].total);

        // Total BuyIns (Approved)
        const buyInsRes = await pool.query(
            "SELECT COALESCE(SUM(amount), 0) as total FROM buy_ins WHERE user_id = $1 AND status = 'approved'",
            [userId]
        );
        const totalBuyIns = parseFloat(buyInsRes.rows[0].total);

        const totalPL = totalWinnings - totalBuyIns;

        // For Weekly/Monthly/Yearly, we need to filter by date. 
        // Sessions have created_at. Join session_players with sessions.

        // This is getting complex for a single query. Let's do a smarter query.

        const statsQuery = `
            SELECT 
                COALESCE(SUM(CASE WHEN s.created_at >= NOW() - INTERVAL '7 days' THEN (sp.final_winnings - COALESCE(b.buyin_amount, 0)) ELSE 0 END), 0) as weekly_pl,
                COALESCE(SUM(CASE WHEN s.created_at >= NOW() - INTERVAL '30 days' THEN (sp.final_winnings - COALESCE(b.buyin_amount, 0)) ELSE 0 END), 0) as monthly_pl,
                COALESCE(SUM(CASE WHEN s.created_at >= NOW() - INTERVAL '1 year' THEN (sp.final_winnings - COALESCE(b.buyin_amount, 0)) ELSE 0 END), 0) as yearly_pl,
                COALESCE(SUM(sp.final_winnings - COALESCE(b.buyin_amount, 0)), 0) as total_pl
            FROM session_players sp
            JOIN sessions s ON sp.session_id = s.id
            LEFT JOIN (
                SELECT session_id, user_id, SUM(amount) as buyin_amount 
                FROM buy_ins 
                WHERE status = 'approved' 
                GROUP BY session_id, user_id
            ) b ON sp.session_id = b.session_id AND sp.user_id = b.user_id
            WHERE sp.user_id = $1
        `;

        const statsRes = await pool.query(statsQuery, [userId]);
        const stats = statsRes.rows[0];

        return res.status(200).json({
            weeklyPL: parseFloat(stats.weekly_pl),
            monthlyPL: parseFloat(stats.monthly_pl),
            yearlyPL: parseFloat(stats.yearly_pl),
            totalPL: parseFloat(stats.total_pl)
        });

    } catch (error: any) {
        console.error('Stats error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
