
-- Database Schema for Poker Ledger MVP
-- Designed for Neon PostgreSQL

-- 1. Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    mobile TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    session_code TEXT UNIQUE NOT NULL,
    blind_value TEXT DEFAULT '5/10',
    created_by UUID REFERENCES users(id),
    status TEXT CHECK (status IN ('active', 'closed')) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE
);

-- 3. Session Players (Join Table)
CREATE TABLE session_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('admin', 'player')) DEFAULT 'player',
    final_winnings NUMERIC(12, 2) DEFAULT 0,
    UNIQUE(session_id, user_id)
);

-- 4. Buy-Ins table
CREATE TABLE buy_ins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexing for performance
CREATE INDEX idx_sessions_code ON sessions(session_code);
CREATE INDEX idx_buy_ins_session ON buy_ins(session_id);
CREATE INDEX idx_session_players_session ON session_players(session_id);
