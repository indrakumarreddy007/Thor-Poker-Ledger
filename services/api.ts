import { User, Session, SessionPlayer, BuyIn, CashOut, PlayerStats, SessionStatus, BuyInStatus, Role } from '../types';

const API_BASE = '/api';

// Helper to map DB columns (snake_case) to Frontend types (camelCase)
const mapUser = (u: any): User => ({
    id: u.id,
    name: u.name,
    username: u.username,
    mobile: u.mobile
});

const mapSession = (s: any): Session => ({
    id: s.id,
    name: s.name,
    sessionCode: s.session_code,
    createdBy: s.created_by,
    status: s.status as SessionStatus,
    createdAt: new Date(s.created_at).getTime(),
    closedAt: s.closed_at ? new Date(s.closed_at).getTime() : undefined,
    blindValue: s.blind_value
});

const mapPlayer = (p: any): SessionPlayer => ({
    sessionId: p.session_id,
    userId: p.user_id,
    name: p.name,
    role: p.role as Role,
    finalWinnings: p.final_winnings ? parseFloat(p.final_winnings) : undefined
});

const mapBuyIn = (b: any): BuyIn => ({
    id: b.id,
    sessionId: b.session_id,
    userId: b.user_id,
    amount: parseFloat(b.amount),
    status: b.status as BuyInStatus,
    timestamp: new Date(b.timestamp).getTime()
});

export const api = {
    // Auth
    register: async (name: string, username: string, password: string): Promise<{ success: boolean; error?: string; user?: User }> => {
        try {
            const res = await fetch(`${API_BASE}/auth?type=register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, username, password, action: 'register' })
            });
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const data = await res.json();
                if (!res.ok) return { success: false, error: data.error || `Error ${res.status}` };
                return { success: true, user: mapUser(data.user) };
            } else {
                const text = await res.text();
                // Return the raw text (truncated) to help debugging in UI
                return { success: false, error: `Server Error (${res.status}): ${text.slice(0, 100)}...` };
            }
        } catch (e: any) {
            return { success: false, error: `Network error: ${e.message}` };
        }
    },

    login: async (username: string, password: string): Promise<{ success: boolean; error?: string; user?: User }> => {
        try {
            const res = await fetch(`${API_BASE}/auth?type=login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, action: 'login' })
            });
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const data = await res.json();
                if (!res.ok) return { success: false, error: data.error || `Error ${res.status}` };
                return { success: true, user: mapUser(data.user) };
            } else {
                const text = await res.text();
                return { success: false, error: `Server Error (${res.status}): ${text.slice(0, 100)}...` };
            }
        } catch (e: any) {
            return { success: false, error: `Network error: ${e.message}` };
        }
    },

    // Sessions
    getSessions: async (): Promise<Session[]> => {
        const res = await fetch(`${API_BASE}/sessions`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.map(mapSession);
    },

    createSession: async (name: string, blindValue: string, createdBy: string): Promise<{ success: boolean; session?: Session; error?: string }> => {
        try {
            const res = await fetch(`${API_BASE}/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, blindValue, createdBy })
            });
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const data = await res.json();
                if (!res.ok) return { success: false, error: data.error || `Error ${res.status}` };
                return { success: true, session: mapSession(data) };
            } else {
                const text = await res.text();
                return { success: false, error: `Server Error (${res.status}): ${text.slice(0, 100)}...` };
            }
        } catch (e: any) {
            return { success: false, error: `Network error: ${e.message}` };
        }
    },

    getSession: async (idOrCode: string): Promise<{ session: Session, players: SessionPlayer[], buyIns: BuyIn[], cashOuts: CashOut[] } | null> => {
        const res = await fetch(`${API_BASE}/session/${idOrCode}`);
        if (!res.ok) return null;
        const data = await res.json();
        return {
            session: mapSession(data.session),
            players: data.players.map(mapPlayer),
            buyIns: data.buyIns.map(mapBuyIn),
            cashOuts: (data.cashOuts || []).map((c: any) => ({
                id: c.id,
                sessionId: c.session_id,
                userId: c.user_id,
                amount: parseFloat(c.amount),
                timestamp: new Date(c.timestamp).getTime()
            }))
        };
    },

    joinSession: async (code: string, userId: string, role: Role = 'player'): Promise<{ success: boolean; error?: string; player?: SessionPlayer; sessionId?: string }> => {
        const res = await fetch(`${API_BASE}/actions?type=join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, userId, role, action: 'join' })
        });
        const data = await res.json();
        if (!res.ok) return { success: false, error: data.error };
        return { success: true, player: mapPlayer(data.player), sessionId: data.sessionId };
    },

    requestBuyIn: async (sessionId: string, userId: string, amount: number, status: BuyInStatus = 'pending'): Promise<{ success: boolean; error?: string; buyIn?: BuyIn }> => {
        const res = await fetch(`${API_BASE}/transaction?type=buyin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, userId, amount, status, type: 'buyin' })
        });
        const data = await res.json();
        if (!res.ok) return { success: false, error: data.error };
        return { success: true, buyIn: mapBuyIn(data.buyIn) };
    },

    updateBuyInStatus: async (buyInId: string, status: BuyInStatus): Promise<boolean> => {
        const res = await fetch(`${API_BASE}/transaction/${buyInId}?type=buyin`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        return res.ok;
    },

    updateBuyInAmount: async (buyInId: string, amount: number): Promise<boolean> => {
        const res = await fetch(`${API_BASE}/transaction/${buyInId}?type=buyin`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount })
        });
        return res.ok;
    },

    deleteBuyIn: async (buyInId: string): Promise<boolean> => {
        const res = await fetch(`${API_BASE}/transaction/${buyInId}?type=buyin`, {
            method: 'DELETE'
        });
        return res.ok;
    },

    cashOut: async (sessionId: string, userId: string, amount: number): Promise<{ success: boolean; error?: string; cashOut?: CashOut }> => {
        const res = await fetch(`${API_BASE}/transaction?type=cashout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, userId, amount, type: 'cashout' })
        });
        const data = await res.json();
        if (!res.ok) return { success: false, error: data.error };
        return { success: true, cashOut: { ...data.cashOut, amount: parseFloat(data.cashOut.amount), timestamp: new Date(data.cashOut.timestamp).getTime() } };
    },

    updateCashOut: async (cashOutId: string, amount: number): Promise<boolean> => {
        const res = await fetch(`${API_BASE}/transaction/${cashOutId}?type=cashout`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount })
        });
        return res.ok;
    },

    deleteCashOut: async (cashOutId: string): Promise<boolean> => {
        const res = await fetch(`${API_BASE}/transaction/${cashOutId}?type=cashout`, {
            method: 'DELETE'
        });
        return res.ok;
    },

    updateSessionStatus: async (sessionId: string, status: SessionStatus): Promise<boolean> => {
        const res = await fetch(`${API_BASE}/actions?type=status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, status, action: 'status' })
        });
        return res.ok;
    },

    settlePlayer: async (sessionId: string, userId: string, winnings: number): Promise<boolean> => {
        const res = await fetch(`${API_BASE}/actions?type=settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, userId, winnings, action: 'settle' })
        });
        return res.ok;
    },

    getUserStats: async (userId: string): Promise<PlayerStats> => {
        const res = await fetch(`${API_BASE}/stats/${userId}`);
        try {
            if (!res.ok) return { weeklyPL: 0, monthlyPL: 0, yearlyPL: 0, totalPL: 0 };
            return await res.json();
        } catch (e) {
            return { weeklyPL: 0, monthlyPL: 0, yearlyPL: 0, totalPL: 0 };
        }
    }
};
