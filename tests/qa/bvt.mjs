// Build Verification Tests (BVTs)
// Runs one smoke test per feature increment. Fail-fast, self-cleaning.
// Usage: npm run bvt
// Adding a new BVT: see tests/qa/BVT-PLAN.md ("How to add a BVT for a new increment").

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import pg from 'pg';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const q = (sql, p) => pool.query(sql, p).then(r => r.rows);

let BASE = null;
async function detectBase() {
    // /api/health was removed to stay under Vercel Hobby's 12-function cap.
    // Probe /api/sessions: on a live dev-api-plugin server it returns 200 with a JSON array.
    // On plain Vite (no plugin) it returns the .ts source as text, which won't parse as an array.
    // Allow an override for multi-worktree setups: `BVT_PORT=3003 npm run bvt`.
    const override = process.env.BVT_PORT;
    const ports = override ? [Number(override)] : [3000, 3001, 3002, 3003];
    for (const port of ports) {
        try {
            const r = await fetch(`http://127.0.0.1:${port}/api/sessions`, { signal: AbortSignal.timeout(8000) });
            if (r.ok) {
                const j = await r.json().catch(() => null);
                if (Array.isArray(j)) return `http://127.0.0.1:${port}`;
            }
        } catch { /* try next */ }
    }
    return null;
}

async function api(method, path, body) {
    const res = await fetch(BASE + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text }; }
    return { status: res.status, body: json };
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

async function bvt0_authAndSessionLifecycle() {
    const run = `bvt_0_${Date.now()}`;
    const hostU = `${run}_host`, guestU = `${run}_guest`;

    let r = await api('POST', '/api/auth/register', { name: 'BVT Host', username: hostU, password: 'pw' });
    assert(r.status === 201 && r.body.user?.id, `register host: ${r.status} ${JSON.stringify(r.body)}`);
    assert(!('password' in (r.body.user || {})), 'register echoed password');
    const hostId = r.body.user.id;

    r = await api('POST', '/api/auth/login', { username: hostU, password: 'pw' });
    assert(r.status === 200 && r.body.user?.id === hostId, `login ok: ${r.status}`);

    r = await api('POST', '/api/auth/login', { username: hostU, password: 'WRONG' });
    assert(r.status === 401, `wrong-pw should be 401, got ${r.status}`);

    r = await api('POST', '/api/auth/register', { name: 'BVT Guest', username: guestU, password: 'pw' });
    assert(r.status === 201 && r.body.user?.id, `register guest: ${r.status}`);
    const guestId = r.body.user.id;

    r = await api('POST', '/api/sessions', { name: `BVT0 ${run}`, blindValue: '5/10', createdBy: hostId });
    assert(r.status === 201 && r.body.id && r.body.session_code, `create session: ${r.status}`);
    const sessionId = r.body.id, sessionCode = r.body.session_code;
    assert(sessionCode.length === 6, `session_code length: ${sessionCode}`);
    const sRow = await q('SELECT status FROM sessions WHERE id=$1', [sessionId]);
    assert(sRow[0]?.status === 'active', `DB session status not active: ${JSON.stringify(sRow)}`);

    r = await api('POST', '/api/session/join', { code: sessionCode, userId: guestId });
    assert((r.status === 200 || r.status === 201) && r.body.player?.session_id === sessionId, `join: ${r.status}`);
    const pRow = await q('SELECT role FROM session_players WHERE session_id=$1 AND user_id=$2', [sessionId, guestId]);
    assert(pRow[0]?.role === 'player', `guest role: ${JSON.stringify(pRow)}`);

    r = await api('POST', '/api/session/buyin', { sessionId, userId: hostId, amount: 100, status: 'approved' });
    assert(r.status === 201 && r.body.buyIn?.status === 'approved', `host buyin: ${r.status}`);
    r = await api('POST', '/api/session/buyin', { sessionId, userId: guestId, amount: 60 });
    assert(r.status === 201 && r.body.buyIn?.status === 'pending', `guest buyin: ${r.status}`);
    const guestBuyInId = r.body.buyIn.id;

    r = await api('PATCH', `/api/buyin/${guestBuyInId}`, { status: 'approved' });
    assert(r.status === 200 && r.body.buyIn?.status === 'approved', `approve: ${r.status}`);

    const r1 = await api('POST', '/api/session/settle', { sessionId, userId: hostId, winnings: 160 });
    const r2 = await api('POST', '/api/session/settle', { sessionId, userId: guestId, winnings: 0 });
    assert(r1.status === 200 && r2.status === 200, `settle: ${r1.status}/${r2.status}`);
    const wRows = await q('SELECT user_id, final_winnings FROM session_players WHERE session_id=$1', [sessionId]);
    const sum = wRows.reduce((a, x) => a + parseFloat(x.final_winnings), 0);
    assert(sum === 160, `settle sum should be 160, got ${sum}`);

    r = await api('POST', '/api/session/status', { sessionId, status: 'closed' });
    assert(r.status === 200, `close: ${r.status}`);
    const cRow = await q('SELECT status, closed_at FROM sessions WHERE id=$1', [sessionId]);
    assert(cRow[0]?.status === 'closed' && cRow[0]?.closed_at !== null, `DB not closed: ${JSON.stringify(cRow)}`);
}

async function bvt1_statsAggregateNumbers() {
    const run = `bvt_1_${Date.now()}`;
    let r = await api('POST', '/api/auth/register', { name: 'BVT1', username: `${run}_u`, password: 'pw' });
    assert(r.status === 201, `register: ${r.status}`);
    const userId = r.body.user.id;

    r = await api('POST', '/api/sessions', { name: `BVT1 ${run}`, blindValue: '5/10', createdBy: userId });
    const sessionId = r.body.id;
    assert(r.status === 201, `create session: ${r.status}`);

    r = await api('POST', '/api/session/buyin', { sessionId, userId, amount: 50, status: 'approved' });
    assert(r.status === 201, `buyin: ${r.status}`);
    r = await api('POST', '/api/session/settle', { sessionId, userId, winnings: 80 });
    assert(r.status === 200, `settle: ${r.status}`);
    r = await api('POST', '/api/session/status', { sessionId, status: 'closed' });
    assert(r.status === 200, `close: ${r.status}`);

    r = await api('GET', `/api/stats/${userId}`);
    assert(r.status === 200, `stats: ${r.status}`);
    const s = r.body;
    for (const k of ['weeklyPL', 'monthlyPL', 'yearlyPL', 'totalPL']) {
        assert(typeof s[k] === 'number' && !Number.isNaN(s[k]), `${k} not a JS number: ${typeof s[k]} (${s[k]})`);
    }
    assert(s.totalPL === 30, `totalPL should be 30 (80 - 50), got ${s.totalPL}`);
}

async function bvt2_tableBuyInsAggregation() {
    const run = `bvt_2_${Date.now()}`;
    let r = await api('POST', '/api/auth/register', { name: 'BVT2 Host', username: `${run}_host`, password: 'pw' });
    const hostId = r.body.user.id;
    r = await api('POST', '/api/auth/register', { name: 'BVT2 Guest', username: `${run}_guest`, password: 'pw' });
    const guestId = r.body.user.id;

    r = await api('POST', '/api/sessions', { name: `BVT2 ${run}`, blindValue: '5/10', createdBy: hostId });
    const sessionId = r.body.id, sessionCode = r.body.session_code;
    await api('POST', '/api/session/join', { code: sessionCode, userId: guestId });

    await api('POST', '/api/session/buyin', { sessionId, userId: hostId, amount: 100, status: 'approved' });
    await api('POST', '/api/session/buyin', { sessionId, userId: guestId, amount: 60, status: 'approved' });
    await api('POST', '/api/session/buyin', { sessionId, userId: guestId, amount: 40 }); // pending - must be excluded

    r = await api('GET', `/api/session/${sessionCode}`);
    assert(r.status === 200, `GET session: ${r.status}`);
    assert(Array.isArray(r.body.buyIns) && r.body.buyIns.length === 3, `API returns all buy-ins (incl pending): got ${r.body.buyIns?.length}`);
    const sample = r.body.buyIns[0];
    assert('user_id' in sample && 'amount' in sample && 'status' in sample, `buy-in shape: ${JSON.stringify(sample)}`);

    const approvedOnly = r.body.buyIns.filter(b => b.status === 'approved');
    assert(approvedOnly.length === 2, `approved-only filter: expected 2, got ${approvedOnly.length}`);
    const totals = new Map();
    for (const b of approvedOnly) {
        totals.set(b.user_id, (totals.get(b.user_id) ?? 0) + parseFloat(b.amount));
    }
    assert(totals.get(hostId) === 100, `host total should be 100, got ${totals.get(hostId)}`);
    assert(totals.get(guestId) === 60, `guest total should be 60 (pending excluded), got ${totals.get(guestId)}`);
    const pot = [...totals.values()].reduce((a, v) => a + v, 0);
    assert(pot === 160, `pot should be 160, got ${pot}`);

    const dbRows = await q(
        `SELECT user_id, COALESCE(SUM(amount),0)::numeric AS total
         FROM buy_ins WHERE session_id=$1 AND status='approved' GROUP BY user_id`,
        [sessionId]);
    const dbMap = Object.fromEntries(dbRows.map(x => [x.user_id, parseFloat(x.total)]));
    assert(dbMap[hostId] === 100 && dbMap[guestId] === 60, `DB totals diverge from API: ${JSON.stringify(dbMap)}`);
}

async function bvt3_historicalPLChart() {
    const run = `bvt_3_${Date.now()}`;
    let r = await api('POST', '/api/auth/register', { name: 'BVT3', username: `${run}_u`, password: 'pw' });
    const userId = r.body.user.id;

    r = await api('POST', '/api/sessions', { name: `BVT3 Closed ${run}`, blindValue: '5/10', createdBy: userId });
    const closedId = r.body.id;
    await api('POST', '/api/session/buyin', { sessionId: closedId, userId, amount: 50, status: 'approved' });
    await api('POST', '/api/session/settle', { sessionId: closedId, userId, winnings: 80 });
    await api('POST', '/api/session/status', { sessionId: closedId, status: 'closed' });

    r = await api('POST', '/api/sessions', { name: `BVT3 Open ${run}`, blindValue: '5/10', createdBy: userId });
    const openId = r.body.id;
    await api('POST', '/api/session/buyin', { sessionId: openId, userId, amount: 20, status: 'approved' });

    r = await api('GET', `/api/stats/${userId}`);
    assert(r.status === 200, `stats: ${r.status}`);
    assert(Array.isArray(r.body.history), `history not array: ${JSON.stringify(r.body.history)}`);
    const closed = r.body.history.find(h => h.sessionId === closedId);
    const open = r.body.history.find(h => h.sessionId === openId);
    assert(closed, `closed session missing from history`);
    assert(!open, `open session leaked into history: ${JSON.stringify(open)}`);
    assert(typeof closed.sessionId === 'string', `sessionId not string`);
    assert(typeof closed.sessionName === 'string', `sessionName not string`);
    assert(typeof closed.date === 'number' && !Number.isNaN(closed.date), `date not number: ${typeof closed.date}`);
    assert(typeof closed.pl === 'number' && closed.pl === 30, `pl should be 30, got ${closed.pl} (${typeof closed.pl})`);
}

const BVTS = [
    { n: 0, name: 'auth + session lifecycle', fn: bvt0_authAndSessionLifecycle },
    { n: 1, name: 'stats aggregate numbers', fn: bvt1_statsAggregateNumbers },
    { n: 2, name: 'table buy-ins aggregation', fn: bvt2_tableBuyInsAggregation },
    { n: 3, name: 'historical P/L chart', fn: bvt3_historicalPLChart },
];

// Cleanup gotcha: sessions.created_by lacks ON DELETE CASCADE (see database.sql:19),
// so we must delete sessions created by these users BEFORE deleting the users themselves.
async function cleanup() {
    const users = await q(`SELECT id FROM users WHERE username LIKE 'bvt_%'`);
    if (users.length === 0) return;
    const ids = users.map(u => u.id);
    await q(`DELETE FROM sessions WHERE created_by = ANY($1::uuid[])`, [ids]);
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
}

async function main() {
    BASE = await detectBase();
    if (!BASE) {
        console.error('Dev server not reachable on 3000-3003. Start it with `npm run dev` (or pass BVT_PORT=<port>) and retry.');
        process.exit(1);
    }
    console.log(`BVT target: ${BASE}\n`);

    const t0 = Date.now();
    const failed = [];
    for (const b of BVTS) {
        const start = Date.now();
        try {
            await b.fn();
            console.log(`PASS  BVT-${b.n} ${b.name} - ${Date.now() - start}ms`);
        } catch (e) {
            const ms = Date.now() - start;
            console.log(`FAIL  BVT-${b.n} ${b.name} - ${ms}ms - FAILED: ${e.message}`);
            failed.push({ n: b.n, name: b.name, err: e.message });
        }
    }
    const total = Date.now() - t0;
    console.log(`\nTotal: ${total}ms | ${BVTS.length - failed.length} pass / ${failed.length} fail`);

    try { await cleanup(); console.log('Cleanup: done.'); } catch (e) { console.log('Cleanup warning:', e.message); }
    await pool.end();
    process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async e => {
    console.error('FATAL', e);
    try { await cleanup(); } catch {}
    try { await pool.end(); } catch {}
    process.exit(2);
});
