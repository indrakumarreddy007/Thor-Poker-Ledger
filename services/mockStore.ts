
import { User, Session, SessionPlayer, BuyIn, SessionStatus, BuyInStatus, Role, PlayerStats } from '../types';

const STORAGE_KEYS = {
  SESSIONS: 'poker_sessions',
  BUYINS: 'poker_buyins',
  PLAYERS: 'poker_players',
  USER: 'poker_current_user',
  USERS_DB: 'poker_users_database'
};

const getFromStorage = <T,>(key: string, defaultValue: T): T => {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : defaultValue;
};

const saveToStorage = (key: string, data: any) => {
  localStorage.setItem(key, JSON.stringify(data));
};

export const mockStore = {
  // Auth logic
  getCurrentUser: (): User | null => getFromStorage(STORAGE_KEYS.USER, null),
  setCurrentUser: (user: User) => saveToStorage(STORAGE_KEYS.USER, user),
  logout: () => localStorage.removeItem(STORAGE_KEYS.USER),

  register: (name: string, username: string, password: string): { success: boolean, error?: string, user?: User } => {
    const users = getFromStorage<User[]>(STORAGE_KEYS.USERS_DB, []);
    if (users.find(u => u.username === username.toLowerCase())) {
      return { success: false, error: 'Username already taken' };
    }
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      username: username.toLowerCase(),
      password
    };
    saveToStorage(STORAGE_KEYS.USERS_DB, [...users, newUser]);
    return { success: true, user: newUser };
  },

  authenticate: (username: string, password: string): { success: boolean, error?: string, user?: User } => {
    const users = getFromStorage<User[]>(STORAGE_KEYS.USERS_DB, []);
    const user = users.find(u => u.username === username.toLowerCase() && u.password === password);
    if (!user) {
      return { success: false, error: 'Invalid username or password' };
    }
    return { success: true, user };
  },

  // Session logic
  createSession: (name: string, blindValue: string, creator: User): Session => {
    const sessions = getFromStorage<Session[]>(STORAGE_KEYS.SESSIONS, []);
    const newSession: Session = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      blindValue,
      sessionCode: Math.random().toString(36).substr(2, 6).toUpperCase(),
      createdBy: creator.id,
      status: 'active',
      createdAt: Date.now(),
    };
    saveToStorage(STORAGE_KEYS.SESSIONS, [...sessions, newSession]);
    mockStore.joinSession(newSession.sessionCode, creator, 'admin');
    return newSession;
  },

  getAllSessions: (): Session[] => getFromStorage<Session[]>(STORAGE_KEYS.SESSIONS, []),

  getSessionByCode: (code: string): Session | undefined => {
    const sessions = getFromStorage<Session[]>(STORAGE_KEYS.SESSIONS, []);
    return sessions.find(s => s.sessionCode === code.toUpperCase());
  },

  getSessionById: (id: string): Session | undefined => {
    const sessions = getFromStorage<Session[]>(STORAGE_KEYS.SESSIONS, []);
    return sessions.find(s => s.id === id);
  },

  updateSessionStatus: (sessionId: string, status: SessionStatus) => {
    const sessions = getFromStorage<Session[]>(STORAGE_KEYS.SESSIONS, []);
    const updated = sessions.map(s => s.id === sessionId ? { ...s, status, closedAt: status === 'closed' ? Date.now() : undefined } : s);
    saveToStorage(STORAGE_KEYS.SESSIONS, updated);
  },

  joinSession: (code: string, user: User, role: Role = 'player') => {
    const session = mockStore.getSessionByCode(code);
    if (!session) return null;
    const players = getFromStorage<SessionPlayer[]>(STORAGE_KEYS.PLAYERS, []);
    
    const existingIndex = players.findIndex(p => p.sessionId === session.id && p.userId === user.id);
    
    if (existingIndex === -1) {
      const newPlayer: SessionPlayer = { sessionId: session.id, userId: user.id, name: user.name, role };
      saveToStorage(STORAGE_KEYS.PLAYERS, [...players, newPlayer]);
      return newPlayer;
    } else {
      if (players[existingIndex].role === 'admin') return players[existingIndex];
      if (role === 'admin') {
        players[existingIndex].role = 'admin';
        saveToStorage(STORAGE_KEYS.PLAYERS, players);
      }
      return players[existingIndex];
    }
  },

  getSessionPlayers: (sessionId: string): SessionPlayer[] => {
    const players = getFromStorage<SessionPlayer[]>(STORAGE_KEYS.PLAYERS, []);
    return players.filter(p => p.sessionId === sessionId);
  },

  updatePlayerWinnings: (sessionId: string, userId: string, winnings: number) => {
    const players = getFromStorage<SessionPlayer[]>(STORAGE_KEYS.PLAYERS, []);
    const updated = players.map(p => (p.sessionId === sessionId && p.userId === userId) ? { ...p, finalWinnings: winnings } : p);
    saveToStorage(STORAGE_KEYS.PLAYERS, updated);
  },

  requestBuyIn: (sessionId: string, userId: string, amount: number, status?: BuyInStatus) => {
    const buyIns = getFromStorage<BuyIn[]>(STORAGE_KEYS.BUYINS, []);
    const sessions = getFromStorage<Session[]>(STORAGE_KEYS.SESSIONS, []);
    const session = sessions.find(s => s.id === sessionId);

    // AUTO-APPROVE LOGIC: If user is the creator (admin) of the session, auto-approve.
    let finalStatus: BuyInStatus = status || 'pending';
    if (!status && session && session.createdBy === userId) {
      finalStatus = 'approved';
    }

    const newBuyIn: BuyIn = {
      id: Math.random().toString(36).substr(2, 9),
      sessionId,
      userId,
      amount,
      status: finalStatus,
      timestamp: Date.now(),
    };
    saveToStorage(STORAGE_KEYS.BUYINS, [...buyIns, newBuyIn]);
    return newBuyIn;
  },

  getSessionBuyIns: (sessionId: string): BuyIn[] => {
    const buyIns = getFromStorage<BuyIn[]>(STORAGE_KEYS.BUYINS, []);
    return buyIns.filter(b => b.sessionId === sessionId);
  },

  updateBuyInStatus: (buyInId: string, status: BuyInStatus) => {
    const buyIns = getFromStorage<BuyIn[]>(STORAGE_KEYS.BUYINS, []);
    const updated = buyIns.map(b => b.id === buyInId ? { ...b, status } : b);
    saveToStorage(STORAGE_KEYS.BUYINS, updated);
  },

  getUserStats: (userId: string): PlayerStats => {
    const allSessions = mockStore.getAllSessions();
    const allPlayers = getFromStorage<SessionPlayer[]>(STORAGE_KEYS.PLAYERS, []);
    const allBuyIns = getFromStorage<BuyIn[]>(STORAGE_KEYS.BUYINS, []);

    const closedSessions = allSessions.filter(s => s.status === 'closed');
    const userClosedParticipations = allPlayers.filter(p => p.userId === userId && closedSessions.some(s => s.id === p.sessionId));

    const stats: PlayerStats = { weeklyPL: 0, monthlyPL: 0, yearlyPL: 0, totalPL: 0 };
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const oneMonth = 30 * 24 * 60 * 60 * 1000;
    const oneYear = 365 * 24 * 60 * 60 * 1000;

    userClosedParticipations.forEach(p => {
      const session = closedSessions.find(s => s.id === p.sessionId);
      if (!session) return;
      
      const playerBuyIns = allBuyIns.filter(b => b.sessionId === p.sessionId && b.userId === userId && b.status === 'approved');
      const totalBuyIn = playerBuyIns.reduce((sum, b) => sum + b.amount, 0);
      const net = (p.finalWinnings || 0) - totalBuyIn;

      stats.totalPL += net;
      if (now - (session.closedAt || 0) < oneWeek) stats.weeklyPL += net;
      if (now - (session.closedAt || 0) < oneMonth) stats.monthlyPL += net;
      if (now - (session.closedAt || 0) < oneYear) stats.yearlyPL += net;
    });

    return stats;
  }
};
