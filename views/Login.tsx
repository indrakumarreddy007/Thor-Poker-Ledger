
import React, { useState } from 'react';
import { User } from '../types';
import { api } from '../services/api';
import { LogIn, UserPlus, ShieldCheck } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'signup') {
      if (!name.trim() || !username.trim() || !password.trim()) {
        setError('All fields are required');
        return;
      }
      const result = await api.register(name, username, password);
      if (result.success && result.user) {
        onLogin(result.user);
      } else {
        setError(result.error || 'Registration failed');
      }
    } else {
      if (!username.trim() || !password.trim()) {
        setError('Username and password are required');
        return;
      }
      const result = await api.login(username, password);
      if (result.success && result.user) {
        onLogin(result.user);
      } else {
        setError(result.error || 'Authentication failed');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950">
      <div className="w-full max-w-sm space-y-8 animate-slide">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-950 text-4xl font-black mb-4 shadow-xl shadow-emerald-500/20">
            ♠
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-1">Poker Ledger</h1>
          <p className="text-slate-500 text-sm font-semibold tracking-wide uppercase">Private High Roller Network</p>
        </div>

        <div className="glass p-1.5 rounded-2xl flex gap-1 mb-2">
          <button
            onClick={() => { setMode('signin'); setError(''); }}
            className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${mode === 'signin' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode('signup'); setError(''); }}
            className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${mode === 'signup' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                <input
                  type="text"
                  required
                  className="appearance-none block w-full px-4 py-4 border border-slate-800 placeholder:text-slate-600 text-slate-50 rounded-xl bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all text-sm font-bold"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Username</label>
              <input
                type="text"
                required
                className="appearance-none block w-full px-4 py-4 border border-slate-800 placeholder:text-slate-600 text-slate-50 rounded-xl bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all text-sm font-bold"
                placeholder="poker_pro_123"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Security Key</label>
              <input
                type="password"
                required
                className="appearance-none block w-full px-4 py-4 border border-slate-800 placeholder:text-slate-600 text-slate-50 rounded-xl bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all text-sm font-bold"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-rose-500 text-[10px] text-center font-bold uppercase tracking-wider">{error}</p>}

          <button
            type="submit"
            className="group relative w-full flex justify-center items-center gap-2 py-5 px-4 border border-transparent text-sm font-black rounded-xl text-slate-950 bg-emerald-500 hover:bg-emerald-400 focus:outline-none transition-all active:scale-95 shadow-xl shadow-emerald-500/20"
          >
            {mode === 'signin' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {mode === 'signin' ? 'Access Ledger' : 'Create Profile'}
          </button>
        </form>

        <div className="flex items-center justify-center gap-2 pt-4 opacity-30">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">End-to-End Encrypted Storage</span>
        </div>

        <p className="text-center text-[9px] text-slate-800 uppercase font-black tracking-widest mt-8">
          Mock Persistence Layer <span className="text-slate-900 mx-1">•</span> V1.1
        </p>
      </div>
    </div>
  );
}
