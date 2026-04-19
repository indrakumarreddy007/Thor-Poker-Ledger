# BVT Regression Plan

Build Verification Tests (BVTs) are tiny, fast, self-cleaning smoke tests that prove a single feature still works end-to-end. Run on every build and before every PR merge. If a BVT fails, the increment it locks in regressed.

- Runner: `tests/qa/bvt.mjs`
- Entry point: `npm run bvt`
- Target total runtime: **under 30s**
- Each BVT must finish in **≤5s** or be split.

Each BVT:
- Owns a unique run ID (`bvt_<incNumber>_<timestamp>`) so parallel runs don't collide.
- Drives real HTTP against the dev server (port 3000 or 3001 — auto-detected via `/api/health`).
- Verifies DB side effects via `pg` using `DATABASE_URL` from `.env.local`.
- Cleans up its own test users at the end.

## Cleanup gotcha (future-self)

`sessions.created_by` is a plain FK with **no ON DELETE CASCADE** (see `database.sql:19`). That means `DELETE FROM users WHERE username LIKE 'bvt_%'` will fail with a FK constraint error as long as any of those users still own a session row. The runner's `cleanup()` explicitly deletes `sessions WHERE created_by = ANY(...)` before dropping the users. `buy_ins` and `session_players` DO cascade from both `sessions` and `users`, so they clean up for free. If you ever add a new table that references `users(id)`, audit whether you need the same two-step delete.

---

## Increment 0 — Auth + session lifecycle

**Feature:** Register two users; host creates a session; guest joins via code; both buy in; host approves the pending buy-in; host settles winnings; host closes the session.

**Covers:**
- `POST /api/auth/register`
- `POST /api/auth/login` (including wrong-password path)
- `POST /api/sessions`
- `POST /api/session/join`
- `POST /api/session/buyin`
- `PATCH /api/buyin/<id>`
- `POST /api/session/settle`
- `POST /api/session/status`

**Asserts:**
- Registration returns `{success, user:{id,name,username}}` with no `password` echoed.
- Login with correct creds returns user; login with wrong password returns **401** (not 500).
- `sessions.status='active'` after create; `session_code` is 6 chars.
- `session_players` row exists for the joined guest with role='player'.
- Host can self-approve their buy-in; guest buy-in defaults to pending; PATCH approves it and DB reflects it.
- Settlement persists `final_winnings`; sum equals sum of approved buy-ins.
- Session transitions to `status='closed'` with `closed_at` set.

**Expected runtime:** ~3s

---

## Increment 1 — Stats aggregate numbers

**Feature:** Stats endpoint returns P/L aggregates as JS numbers, not Postgres string-encoded numerics.

**Covers:**
- `GET /api/stats/<userId>`
- `parseFloat` at the edge of each SQL query (`api/stats/[userId].ts` lines ~29, 36, 94-97).

**Asserts:**
- `weeklyPL`, `monthlyPL`, `yearlyPL`, `totalPL` are all `typeof === 'number'` and not NaN.
- With a fixture (winnings=80, approved buy-ins=50 in one closed session) `totalPL === 30`.

**Expected runtime:** ~2s

---

## Increment 2 — Table Buy-Ins aggregation

**Feature:** Session endpoint exposes all buy-ins so the UI leaderboard can compute per-player totals, pot total, and pot share from approved-only buy-ins.

**Covers:**
- `GET /api/session/<code>` payload shape (`api/session/[id].ts`)
- Dynamic-segment routing: BVT exercises the code form; UUID form is covered in BVT-0 via E2E pairs.
- Aggregation semantics (what the UI / `lib/buyIns.ts` relies on).

**Asserts:**
- Response has `buyIns: []` with snake_case rows including `user_id`, `amount`, `status`.
- API includes pending buy-ins in the array; consumers must filter to approved.
- Given (host approved 100, guest approved 60, guest pending 40):
  - Approved-only filter leaves 2 rows.
  - Per-player totals: host=100, guest=60 (pending 40 excluded).
  - Pot = 160.
  - DB-side aggregation `SUM(amount) GROUP BY user_id` matches the API-derived aggregation (catches any divergence between API and the raw store).

**Note:** The helper `lib/buyIns.ts` is a pure wrapper over this exact aggregation and has its own unit tests in `lib/buyIns.test.ts`. BVT-2 verifies the **data contract** the UI depends on, independent of which helper does the math — so the BVT stays runnable even when the lib module isn't present on the current checkout.

**Expected runtime:** ~2s

---

## Increment 3 — Historical P/L chart data

**Feature:** `GET /api/stats/<userId>` returns a `history` array of closed sessions for charting.

**Covers:**
- `api/stats/[userId].ts` historyQuery (filter `s.status = 'closed'`, ordered ASC, `parseFloat` coercion on returned numerics).

**Asserts:**
- `history` is an array.
- Each entry: `{sessionId:string, sessionName:string, date:number, pl:number}`.
- A session in `status='active'` does NOT appear.
- A session in `status='closed'` with winnings=80 / approved-buy-ins=50 appears with `pl === 30`.
- `date` is a JS number (ms epoch), not a string.

**Expected runtime:** ~3s

---

## How to add a BVT for a new increment

When you ship a new feature, add a BVT so future PRs can't silently regress it. Follow this 5-step recipe:

1. **Pick the next increment number.** Use `N` = (current max + 1). Increment 4 is next.
2. **Write the function in `tests/qa/bvt.mjs`:**
   ```js
   async function bvtN_<featureName>() {
       const run = `bvt_${N}_${Date.now()}`;
       // drive via the existing `api(method, path, body)` helper;
       // use `q(sql, params)` for DB side-effect checks;
       // use `assert(cond, msg)` to fail loudly.
   }
   ```
   Keep it under 5s. One feature per BVT.
3. **Register it** in the `BVTS` array at the bottom of `bvt.mjs`:
   ```js
   { n: N, name: 'short feature label', fn: bvtN_featureName }
   ```
4. **Scope all test data** with the `bvt_N_...` username prefix. Cleanup is whitelisted on `username LIKE 'bvt_%'`, so no hand-coded DELETEs needed — but your prefix must start with `bvt_`.
5. **Document it here** in `BVT-PLAN.md` with a new `## Increment N` section matching the format above: Feature, Covers, Asserts, Expected runtime.

Rules of thumb:
- One assertion failure = one regression. `throw` early and let the runner's try/catch report it.
- Assert both **API response shape** AND a **DB side effect** when the feature writes data.
- Reuse `api()` and `q()` — don't add deps or new clients.
- If a BVT exceeds 5s, split it or reduce the fixture size.
- If a new feature adds a table referencing `users(id)`, check the cleanup note above.
