import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../../../lib/db.js', () => ({
  default: { query: mockQuery },
}));

import handler from '../../../api/stats/[userId]';

type MockReq = { method: string; query: Record<string, string | undefined>; body?: any };
type MockRes = {
  status: (code: number) => MockRes;
  json: (body: any) => MockRes;
  _status: number;
  _body: any;
};

const mkRes = (): MockRes => {
  const res: any = { _status: 0, _body: null };
  res.status = (code: number) => {
    res._status = code;
    return res;
  };
  res.json = (body: any) => {
    res._body = body;
    return res;
  };
  return res as MockRes;
};

describe('GET /api/stats/[userId]', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 405 for non-GET methods', async () => {
    const res = mkRes();
    await handler({ method: 'POST', query: { userId: 'u1' } } as any, res as any);
    expect(res._status).toBe(405);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 400 when userId is missing', async () => {
    const res = mkRes();
    await handler({ method: 'GET', query: {} } as any, res as any);
    expect(res._status).toBe(400);
    expect(res._body).toEqual({ error: 'Missing userId parameter' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('coerces NUMERIC string aggregates to numbers (happy path)', async () => {
    // Call order in handler:
    //   1. total winnings (not read back by final response)
    //   2. total buy-ins (not read back)
    //   3. stats aggregate (weekly/monthly/yearly/total)
    //   4. history rows
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '1000.00' }] })
      .mockResolvedValueOnce({ rows: [{ total: '400.00' }] })
      .mockResolvedValueOnce({
        rows: [{ weekly_pl: '150.50', monthly_pl: '300.25', yearly_pl: '600.00', total_pl: '600.00' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            session_id: 's1',
            session_name: 'Friday Night',
            session_date: new Date('2025-01-01T00:00:00Z'),
            session_status: 'closed',
            final_winnings: '500.00',
            buyin_amount: '200.00',
          },
        ],
      });

    const res = mkRes();
    await handler({ method: 'GET', query: { userId: 'u1' } } as any, res as any);

    expect(res._status).toBe(200);
    expect(res._body.weeklyPL).toBe(150.5);
    expect(res._body.monthlyPL).toBe(300.25);
    expect(res._body.yearlyPL).toBe(600);
    expect(res._body.totalPL).toBe(600);
    // types.ts — weekly/monthly/yearly/totalPL must be numbers, not strings
    expect(typeof res._body.weeklyPL).toBe('number');
    expect(typeof res._body.totalPL).toBe('number');
  });

  it('shapes each history row correctly and derives pl as winnings minus buyin', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({
        rows: [{ weekly_pl: '0', monthly_pl: '0', yearly_pl: '0', total_pl: '50' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            session_id: 's1',
            session_name: 'Won',
            session_date: new Date('2025-02-10T00:00:00Z'),
            session_status: 'closed',
            final_winnings: '300.00',
            buyin_amount: '100.00',
          },
          {
            session_id: 's2',
            session_name: 'Lost',
            session_date: new Date('2025-02-15T00:00:00Z'),
            session_status: 'closed',
            final_winnings: '0.00',
            buyin_amount: '150.00',
          },
        ],
      });

    const res = mkRes();
    await handler({ method: 'GET', query: { userId: 'u1' } } as any, res as any);

    expect(res._status).toBe(200);
    expect(res._body.history).toHaveLength(2);
    expect(res._body.history[0]).toMatchObject({
      sessionId: 's1',
      sessionName: 'Won',
      pl: 200,
    });
    expect(typeof res._body.history[0].date).toBe('number');
    expect(res._body.history[1]).toMatchObject({
      sessionId: 's2',
      sessionName: 'Lost',
      pl: -150,
    });
  });

  it('returns empty history array when user has no closed sessions', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({
        rows: [{ weekly_pl: '0', monthly_pl: '0', yearly_pl: '0', total_pl: '0' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = mkRes();
    await handler({ method: 'GET', query: { userId: 'u1' } } as any, res as any);

    expect(res._status).toBe(200);
    expect(res._body.history).toEqual([]);
    expect(res._body.totalPL).toBe(0);
  });

  it('returns 500 when a query throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mkRes();
    await handler({ method: 'GET', query: { userId: 'u1' } } as any, res as any);
    errSpy.mockRestore();

    expect(res._status).toBe(500);
    expect(res._body).toEqual({ error: 'Internal server error' });
  });

  it('passes the userId through as a bound parameter (no interpolation)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({
        rows: [{ weekly_pl: '0', monthly_pl: '0', yearly_pl: '0', total_pl: '0' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = mkRes();
    const attack = "1'; DROP TABLE sessions; --";
    await handler({ method: 'GET', query: { userId: attack } } as any, res as any);

    expect(res._status).toBe(200);
    // Every call must pass the userId as a parameter, never inline it into the SQL text
    for (const call of mockQuery.mock.calls) {
      const [sql, params] = call;
      expect(sql).not.toContain('DROP TABLE');
      expect(params).toEqual([attack]);
    }
  });
});
