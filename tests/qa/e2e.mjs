// QA end-to-end test driver
// Drives the running dev server via HTTP and verifies side-effects via pg.

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import pg from 'pg';

const BASE = process.env.QA_BASE || 'http://localhost:3001';
const ts = Date.now();
const qaRunId = `qa_${ts}`;

const results = [];
const pass = (step, msg = '') => { results.push({ step, status: 'PASS', msg }); console.log(`PASS  ${step}${msg ? ' - ' + msg : ''}`); };
const fail = (step, msg) => { results.push({ step, status: 'FAIL', msg }); console.log(`FAIL  ${step} - ${msg}`); };

async function req(method, path, body) {
    const res = await fetch(BASE + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    const text = await res.text();
    try { json = JSON.parse(text); } catch { json = { _raw: text }; }
    return { status: res.status, body: json };
}

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function q(sql, params) {
    const r = await pool.query(sql, params);
    return r.rows;
}

const cleanupUsernames = [];

async function main() {
    const t0 = Date.now();

    // Step 1: register host user
    const hostUsername = `${qaRunId}_host`;
    const hostPassword = 'pw1';
    cleanupUsernames.push(hostUsername);

    let r = await req('POST', '/api/auth/register', { name: 'QA Host', username: hostUsername, password: hostPassword });
    let hostUserId;
    if (r.status === 201 && r.body.success && r.body.user?.id && r.body.user?.username === hostUsername) {
        hostUserId = r.body.user.id;
        const dbRow = await q('SELECT id, username FROM users WHERE id=$1', [hostUserId]);
        if (dbRow.length === 1 && dbRow[0].username === hostUsername) pass('1a register host', `id=${hostUserId}`);
        else fail('1a register host', `DB side effect missing: ${JSON.stringify(dbRow)}`);
    } else fail('1a register host', `status=${r.status} body=${JSON.stringify(r.body)}`);

    // Step 2: login
    r = await req('POST', '/api/auth/login', { username: hostUsername, password: hostPassword });
    if (r.status === 200 && r.body.success && r.body.user?.id === hostUserId && !('password' in r.body.user)) pass('2 login host');
    else fail('2 login host', `status=${r.status} body=${JSON.stringify(r.body)}`);

    // Extra: login with wrong password
    r = await req('POST', '/api/auth/login', { username: hostUsername, password: 'WRONG' });
    if (r.status === 401) pass('2b wrong-password returns 401');
    else fail('2b wrong-password returns 401', `status=${r.status} body=${JSON.stringify(r.body)}`);

    // Step 3: create session
    r = await req('POST', '/api/sessions', { name: `QA Session ${ts}`, blindValue: '5/10', createdBy: hostUserId });
    let sessionId, sessionCode;
    if (r.status === 201 && r.body.id && r.body.session_code) {
        sessionId = r.body.id;
        sessionCode = r.body.session_code;
        const rows = await q('SELECT id, status FROM sessions WHERE id=$1', [sessionId]);
        if (rows.length === 1 && rows[0].status === 'active') pass('3 create session', `code=${sessionCode}`);
        else fail('3 create session', `DB session row unexpected: ${JSON.stringify(rows)}`);
    } else fail('3 create session', `status=${r.status} body=${JSON.stringify(r.body)}`);

    // Step 4: register 2nd user + join session
    const guestUsername = `${qaRunId}_guest`;
    const guestPassword = 'pw2';
    cleanupUsernames.push(guestUsername);
    r = await req('POST', '/api/auth/register', { name: 'QA Guest', username: guestUsername, password: guestPassword });
    let guestUserId;
    if (r.status === 201 && r.body.user?.id) {
        guestUserId = r.body.user.id;
        pass('4a register guest', `id=${guestUserId}`);
    } else fail('4a register guest', `status=${r.status} body=${JSON.stringify(r.body)}`);

    r = await req('POST', '/api/session/join', { code: sessionCode, userId: guestUserId });
    if ((r.status === 201 || r.status === 200) && r.body.success && r.body.player?.session_id === sessionId) {
        const rows = await q('SELECT role FROM session_players WHERE session_id=$1 AND user_id=$2', [sessionId, guestUserId]);
        if (rows.length === 1 && rows[0].role === 'player') pass('4b guest joins via session code');
        else fail('4b guest joins via session code', `DB row unexpected: ${JSON.stringify(rows)}`);
    } else fail('4b guest joins via session code', `status=${r.status} body=${JSON.stringify(r.body)}`);

    // Step 5: buy-ins
    // Host adds own stack approved
    r = await req('POST', '/api/session/buyin', { sessionId, userId: hostUserId, amount: 100, status: 'approved' });
    let hostBuyInId;
    if (r.status === 201 && r.body.success && r.body.buyIn?.status === 'approved') {
        hostBuyInId = r.body.buyIn.id;
        pass('5a host buy-in approved', `id=${hostBuyInId}`);
    } else fail('5a host buy-in approved', `status=${r.status} body=${JSON.stringify(r.body)}`);

    // Guest requests pending buy-in
    r = await req('POST', '/api/session/buyin', { sessionId, userId: guestUserId, amount: 60 });
    let guestBuyInId;
    if (r.status === 201 && r.body.success && r.body.buyIn?.status === 'pending') {
        guestBuyInId = r.body.buyIn.id;
        pass('5b guest buy-in pending', `id=${guestBuyInId}`);
    } else fail('5b guest buy-in pending', `status=${r.status} body=${JSON.stringify(r.body)}`);

    // Step 6: host approves guest buy-in
    r = await req('PATCH', `/api/buyin/${guestBuyInId}`, { status: 'approved' });
    if (r.status === 200 && r.body.success && r.body.buyIn?.status === 'approved') {
        const rows = await q('SELECT status FROM buy_ins WHERE id=$1', [guestBuyInId]);
        if (rows[0]?.status === 'approved') pass('6 approve guest buy-in');
        else fail('6 approve guest buy-in', `DB still not approved: ${JSON.stringify(rows)}`);
    } else fail('6 approve guest buy-in', `status=${r.status} body=${JSON.stringify(r.body)}`);

    // Step 7: GET by sessionCode and by UUID
    r = await req('GET', `/api/session/${sessionCode}`);
    if (r.status === 200 && r.body.session?.id === sessionId &&
        Array.isArray(r.body.players) && r.body.players.length === 2 &&
        Array.isArray(r.body.buyIns) && r.body.buyIns.length === 2) {
        pass('7a GET session by code', `players=${r.body.players.length} buyIns=${r.body.buyIns.length}`);
    } else fail('7a GET session by code', `status=${r.status} body=${JSON.stringify(r.body).slice(0, 400)}`);

    r = await req('GET', `/api/session/${sessionId}`);
    if (r.status === 200 && r.body.session?.id === sessionId) {
        pass('7b GET session by UUID');
    } else fail('7b GET session by UUID', `status=${r.status} body=${JSON.stringify(r.body).slice(0, 400)}`);

    // Extra: aggregation checks
    const approvedRows = await q(
        `SELECT user_id, COALESCE(SUM(amount),0)::numeric as total FROM buy_ins
         WHERE session_id=$1 AND status='approved' GROUP BY user_id`, [sessionId]);
    const potRow = await q(
        `SELECT COALESCE(SUM(amount),0)::numeric as pot FROM buy_ins
         WHERE session_id=$1 AND status='approved'`, [sessionId]);
    const pot = parseFloat(potRow[0].pot);
    if (pot === 160 && approvedRows.length === 2) pass('7c table buy-ins aggregation (pot=160, 2 contributors)');
    else fail('7c table buy-ins aggregation', `pot=${pot} rows=${JSON.stringify(approvedRows)}`);

    // Step 8: settle — zero-sum: host 160 (wins), guest 0 (loses)
    // approved total per user: host=100, guest=60. We must set winnings summing to 160.
    r = await req('POST', '/api/session/settle', { sessionId, userId: hostUserId, winnings: 160 });
    const r2 = await req('POST', '/api/session/settle', { sessionId, userId: guestUserId, winnings: 0 });
    if (r.status === 200 && r2.status === 200 && r.body.success && r2.body.success) {
        const rows = await q('SELECT user_id, final_winnings FROM session_players WHERE session_id=$1', [sessionId]);
        const map = Object.fromEntries(rows.map(x => [x.user_id, parseFloat(x.final_winnings)]));
        if (map[hostUserId] === 160 && map[guestUserId] === 0) pass('8 settle zero-sum', `host=160 guest=0`);
        else fail('8 settle zero-sum', `DB winnings: ${JSON.stringify(map)}`);
    } else fail('8 settle zero-sum', `hostStatus=${r.status} guestStatus=${r2.status}`);

    // Step 9: close session
    r = await req('POST', '/api/session/status', { sessionId, status: 'closed' });
    if (r.status === 200 && r.body.success && r.body.session?.status === 'closed') {
        const rows = await q('SELECT status, closed_at FROM sessions WHERE id=$1', [sessionId]);
        if (rows[0]?.status === 'closed' && rows[0]?.closed_at !== null) pass('9 close session');
        else fail('9 close session', `DB row: ${JSON.stringify(rows[0])}`);
    } else fail('9 close session', `status=${r.status} body=${JSON.stringify(r.body)}`);

    // Step 10: GET stats for host - history must contain this session, numbers must be JS numbers
    r = await req('GET', `/api/stats/${hostUserId}`);
    if (r.status === 200) {
        const s = r.body;
        const isNum = v => typeof v === 'number' && !Number.isNaN(v);
        const typesOk = isNum(s.weeklyPL) && isNum(s.monthlyPL) && isNum(s.yearlyPL) && isNum(s.totalPL);
        if (!typesOk) {
            fail('10a stats numbers are JS numbers', `got ${JSON.stringify({
                weekly: typeof s.weeklyPL, monthly: typeof s.monthlyPL, yearly: typeof s.yearlyPL, total: typeof s.totalPL
            })} values=${JSON.stringify(s)}`);
        } else {
            // host: winnings 160 - buy-ins 100 = +60
            if (s.totalPL === 60) pass('10a stats totals (JS numbers, value correct)', `totalPL=${s.totalPL}`);
            else fail('10a stats totals value', `totalPL=${s.totalPL} expected 60; full=${JSON.stringify(s)}`);
        }
        if (Array.isArray(s.history)) {
            const entry = s.history.find(h => h.sessionId === sessionId);
            if (entry && entry.pl === 60 && typeof entry.date === 'number') pass('10b stats.history contains closed session');
            else fail('10b stats.history contains closed session', `entry=${JSON.stringify(entry)} all=${JSON.stringify(s.history)}`);
        } else fail('10b stats.history is array', `history=${JSON.stringify(s.history)}`);
    } else fail('10 GET stats', `status=${r.status} body=${JSON.stringify(r.body)}`);

    // Extra: open session should NOT appear in history
    // Create an open session with a fresh buy-in for host, and then fetch stats.
    let extraSessionId;
    r = await req('POST', '/api/sessions', { name: `QA Open ${ts}`, blindValue: '5/10', createdBy: hostUserId });
    if (r.status === 201) {
        extraSessionId = r.body.id;
        await req('POST', '/api/session/buyin', { sessionId: extraSessionId, userId: hostUserId, amount: 20, status: 'approved' });
        const sr = await req('GET', `/api/stats/${hostUserId}`);
        if (sr.status === 200 && Array.isArray(sr.body.history)) {
            const found = sr.body.history.find(h => h.sessionId === extraSessionId);
            if (!found) pass('extra: open session absent from history');
            else fail('extra: open session absent from history', `found entry=${JSON.stringify(found)}`);
        } else fail('extra: open session absent from history', `stats fetch bad: ${sr.status}`);
    }

    const t1 = Date.now();
    console.log(`\nTotal runtime: ${((t1 - t0) / 1000).toFixed(2)}s`);

    // Cleanup
    try {
        await q(`DELETE FROM users WHERE username LIKE $1`, [`${qaRunId}%`]);
        console.log('Cleanup: deleted test users.');
    } catch (e) {
        console.log('Cleanup error:', e.message);
    }

    console.log(`\nSummary: ${results.filter(r => r.status === 'PASS').length} pass / ${results.filter(r => r.status === 'FAIL').length} fail`);
    await pool.end();
    process.exit(results.some(r => r.status === 'FAIL') ? 1 : 0);
}

main().catch(async e => {
    console.error('FATAL', e);
    try { await pool.end(); } catch {}
    process.exit(2);
});
