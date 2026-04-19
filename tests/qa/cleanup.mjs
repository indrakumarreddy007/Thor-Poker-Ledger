import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import pg from 'pg';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const q = (sql, p) => pool.query(sql, p);

const r = await q(`SELECT id, username FROM users WHERE username LIKE 'qa_%'`);
console.log(`Found ${r.rows.length} qa_* users`);
if (r.rows.length === 0) { await pool.end(); process.exit(0); }

const ids = r.rows.map(x => x.id);

await q(`DELETE FROM sessions WHERE created_by = ANY($1::uuid[])`, [ids]);
const d = await q(`DELETE FROM users WHERE id = ANY($1::uuid[]) RETURNING id`, [ids]);
console.log(`Deleted ${d.rows.length} users (cascades covered buy_ins/session_players/sessions they were created_by)`);

await pool.end();
