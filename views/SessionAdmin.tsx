
import React, { useState, useEffect } from 'react';
import { User, Session, SessionPlayer, BuyIn } from '../types';
import { api } from '../services/api';
import { Check, X, Users, Wallet, Trophy, Plus, DollarSign, AlertTriangle, History, ChevronDown, ChevronUp, Clock, ShieldCheck, Inbox } from 'lucide-react';
import { useToast } from '../components/Toast';
import EmptyState from '../components/EmptyState';

interface SessionAdminProps {
  user: User;
  sessionCode: string;
  navigate: (path: string) => void;
}

export default function SessionAdmin({ user, sessionCode, navigate }: SessionAdminProps) {
  const toast = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [buyIns, setBuyIns] = useState<BuyIn[]>([]);
  const [isEnding, setIsEnding] = useState(false);
  const [isAddingOwn, setIsAddingOwn] = useState(false);
  const [ownAmount, setOwnAmount] = useState('');
  const [finalChipCounts, setFinalChipCounts] = useState<Record<string, string>>({});
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [fetchError, setFetchError] = useState('');

  const refreshData = async () => {
    // api.getSession returns { session, players, buyIns }
    try {
      const data = await api.getSession(sessionCode);
      if (data) {
        if (data.session.createdBy !== user.id) {
          navigate(`player/${sessionCode}`);
          return;
        }
        if (data.session.status === 'closed') {
          navigate(`settlement/${data.session.id}`);
          return;
        }
        setSession(data.session);
        setPlayers(data.players);
        // Sort buy-ins by timestamp descending (latest first)
        setBuyIns(data.buyIns);
        setFetchError('');
      } else {
        console.error("Failed to fetch session data (data is null)");
        // Only set error if we don't have a session yet
        if (!session) setFetchError('Failed to load session data. Please check connection.');
      }
    } catch (e: any) {
      console.error("Session load error:", e);
      if (!session) setFetchError(`Error: ${e.message || JSON.stringify(e)}`);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, [sessionCode]);

  const handleApprove = async (id: string) => {
    try {
      await api.updateBuyInStatus(id, 'approved');
      toast.success('Buy-in approved');
      refreshData();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to approve buy-in');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await api.updateBuyInStatus(id, 'rejected');
      toast.success('Buy-in rejected');
      refreshData();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to reject buy-in');
    }
  };

  const handleAdminBuyIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !ownAmount) return;
    try {
      await api.requestBuyIn(session.id, user.id, parseFloat(ownAmount), 'approved');
      toast.success(`Added ₹${ownAmount} to your stack`);
      setOwnAmount('');
      setIsAddingOwn(false);
      refreshData();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add buy-in');
    }
  };

  const getPlayerStats = (userId: string) => {
    const playerBuyIns = buyIns.filter(b => b.userId === userId && b.status === 'approved');
    const total = playerBuyIns.reduce((sum, b) => sum + b.amount, 0);
    const history = buyIns.filter(b => b.userId === userId);
    return { total, history };
  };

  const finalizeSession = async () => {
    if (!session) return;
    setError('');
    let totalWinnings = 0;
    const approvedBuyIns = buyIns.filter(b => b.status === 'approved');
    const totalBuyInPool = approvedBuyIns.reduce((sum, b) => sum + b.amount, 0);

    try {
      for (const player of players) {
        const val = parseFloat(finalChipCounts[player.userId] || '0');
        totalWinnings += val;
        await api.settlePlayer(session.id, player.userId, val);
      }

      if (Math.abs(totalWinnings - totalBuyInPool) > 0.1) {
        const msg = `Audit Failed: Chips Out (₹${totalWinnings}) ≠ Pool (₹${totalBuyInPool}).`;
        setError(msg);
        toast.warning('Chip count does not match pool — please re-check');
        return;
      }

      await api.updateSessionStatus(session.id, 'closed');
      toast.success('Session settled');
      navigate(`settlement/${session.id}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to finalize session');
    }
  };

  if (!session) {
    if (fetchError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
          <div className="text-rose-400 font-bold uppercase tracking-widest">{fetchError}</div>
          <button
            onClick={() => navigate('home')}
            className="px-6 py-2 bg-slate-800 rounded-full text-xs font-bold hover:bg-slate-700 transition"
          >
            Return to Lobby
          </button>
        </div>
      );
    }
    return <div className="text-center py-20 text-slate-500 animate-pulse font-bold uppercase tracking-widest">Loading Secure Table...</div>;
  }

  const pendingBuyIns = buyIns.filter(b => b.status === 'pending');

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {/* Admin Header */}
      <div className="bg-slate-900 p-5 sm:p-6 rounded-[2rem] border border-slate-800 shadow-2xl border-t-emerald-500/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 md:gap-6">
          <div className="space-y-2 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3 break-words">
              <span className="truncate">{session.name}</span>
              <span className="text-[10px] bg-emerald-500 text-slate-950 px-2.5 py-1 rounded-full uppercase tracking-tighter font-black flex-shrink-0">Host</span>
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Code</span>
                <span className="font-mono text-emerald-400 font-black bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 select-all">{session.sessionCode}</span>
                <button
                  type="button"
                  aria-label="Copy invite link"
                  onClick={async () => {
                    const link = `${window.location.origin}/#/join/${session.sessionCode}`;
                    try {
                      await navigator.clipboard.writeText(link);
                      toast.success('Invite link copied to clipboard');
                    } catch {
                      toast.error('Clipboard unavailable — copy the access code manually');
                    }
                  }}
                  className="p-2 min-h-[32px] min-w-[32px] bg-slate-800 hover:bg-emerald-500 text-slate-400 hover:text-slate-950 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                  title="Copy Invite Link"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                </button>
              </div>
              <div className="w-1 h-1 rounded-full bg-slate-700"></div>
              <span className="text-xs text-slate-400 font-medium">Blinds: {session.blindValue}</span>
            </div>
          </div>
          <div className="flex gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setIsAddingOwn(!isAddingOwn)}
              className="flex-1 md:flex-none bg-slate-800 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 px-4 sm:px-5 py-3 min-h-[44px] rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 border border-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <Plus className="w-4 h-4" aria-hidden="true" /> Buy-In
            </button>
            <button
              type="button"
              onClick={() => setIsEnding(true)}
              className="flex-1 md:flex-none bg-rose-500 hover:bg-rose-600 text-white px-4 sm:px-6 py-3 min-h-[44px] rounded-2xl font-black text-sm transition-all shadow-xl shadow-rose-500/30 flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              <span className="sm:hidden">End</span>
              <span className="hidden sm:inline">End Session</span>
            </button>
          </div>
        </div>
      </div>

      {isAddingOwn && (
        <form onSubmit={handleAdminBuyIn} className="bg-emerald-500/5 border-2 border-emerald-500/20 p-4 sm:p-6 rounded-[2rem] animate-in zoom-in-95 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-1 relative">
            <label htmlFor="admin-own-amount" className="sr-only">Host buy-in amount</label>
            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500" aria-hidden="true" />
            <input
              id="admin-own-amount"
              type="number"
              inputMode="numeric"
              autoFocus
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 font-black text-xl text-white"
              placeholder="0.00"
              value={ownAmount}
              onChange={(e) => setOwnAmount(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button type="submit" className="flex-1 sm:flex-none bg-emerald-500 text-slate-950 px-6 sm:px-8 py-4 min-h-[44px] rounded-xl font-black shadow-lg shadow-emerald-500/20 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">Add Stack</button>
            <button type="button" aria-label="Cancel host buy-in" onClick={() => setIsAddingOwn(false)} className="p-3 sm:p-4 min-h-[44px] min-w-[44px] text-slate-500 hover:text-white transition-colors rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"><X className="w-6 h-6" aria-hidden="true" /></button>
          </div>
        </form>
      )}

      {isEnding ? (
        <div className="bg-slate-900 border-2 border-amber-500/50 rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 space-y-6 animate-in slide-in-from-top-4 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center">
              <Trophy className="text-amber-500 w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Final Chip Count</h2>
              <p className="text-sm text-slate-400 font-medium">Verify that all chips on table match the pool of ₹{buyIns.filter(b => b.status === 'approved').reduce((s, b) => s + b.amount, 0)}</p>
            </div>
          </div>

          <div className="space-y-3">
            {players.map(p => {
              const inputId = `chip-count-${p.userId}`;
              return (
                <div key={p.userId} className="flex items-center justify-between gap-3 p-4 sm:p-5 bg-slate-950 rounded-2xl border border-slate-800 focus-within:border-amber-500/50 transition-all group">
                  <div className="min-w-0">
                    <label htmlFor={inputId} className="font-black text-slate-200 block cursor-pointer truncate">{p.name}</label>
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Invested: ₹{getPlayerStats(p.userId).total}</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <span className="text-slate-600 font-bold" aria-hidden="true">₹</span>
                    <input
                      id={inputId}
                      type="number"
                      inputMode="numeric"
                      aria-label={`Final chip count for ${p.name}`}
                      className="w-24 sm:w-32 bg-slate-900 border border-slate-800 rounded-xl px-3 sm:px-4 py-3 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 font-black text-white"
                      placeholder="0"
                      value={finalChipCounts[p.userId] || ''}
                      onChange={(e) => setFinalChipCounts(prev => ({ ...prev, [p.userId]: e.target.value }))}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {error && <div role="alert" className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-bold flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" aria-hidden="true" /> {error}
          </div>}

          <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => setIsEnding(false)} className="flex-1 py-5 bg-slate-800 hover:bg-slate-700 rounded-2xl font-black transition-all text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">Cancel</button>
            <button type="button" onClick={finalizeSession} className="flex-1 py-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-2xl font-black transition-all shadow-2xl shadow-emerald-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">Finalize & Settle</button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Approval Queue */}
            <section className="space-y-4">
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2 px-2">
                <Clock className="w-4 h-4" /> Approval Queue ({pendingBuyIns.length})
              </h2>
              <div className="space-y-3">
                {pendingBuyIns.length === 0 ? (
                  <EmptyState
                    icon={ShieldCheck}
                    title="Approval queue is clear"
                    subtitle="New buy-in requests from players will appear here for review."
                  />
                ) : (
                  pendingBuyIns.map(b => {
                    const playerName = players.find(p => p.userId === b.userId)?.name || 'Player';
                    return (
                      <div key={b.id} className="group flex items-center justify-between bg-slate-900 border border-slate-800 p-6 rounded-3xl hover:border-emerald-500/30 transition-all shadow-xl animate-in slide-in-from-left-4">
                        <div>
                          <p className="font-black text-slate-200 text-lg">{playerName}</p>
                          <p className="text-emerald-400 text-3xl font-black tracking-tighter mt-1">₹{b.amount}</p>
                          <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">{new Date(b.timestamp).toLocaleTimeString()}</p>
                        </div>
                        <div className="flex gap-3">
                          <button type="button" aria-label={`Reject ${playerName} buy-in of ₹${b.amount}`} onClick={() => handleReject(b.id)} className="p-4 bg-slate-800 hover:bg-rose-500 text-slate-500 hover:text-white rounded-2xl transition-all shadow-lg active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"><X className="w-6 h-6" aria-hidden="true" /></button>
                          <button type="button" aria-label={`Approve ${playerName} buy-in of ₹${b.amount}`} onClick={() => handleApprove(b.id)} className="p-4 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 rounded-2xl transition-all shadow-lg active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"><Check className="w-6 h-6" aria-hidden="true" /></button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Registry table */}
            <section className="space-y-4">
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2 px-2">
                <Users className="w-4 h-4" /> Live Registry
              </h2>
              <div className="bg-slate-900 rounded-[2rem] border border-slate-800 overflow-hidden shadow-2xl">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-950/50 border-b border-slate-800">
                    <tr>
                      <th className="px-4 sm:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Player</th>
                      <th className="px-4 sm:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Chips In</th>
                      <th className="w-8 sm:w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {players.map(p => {
                      const stats = getPlayerStats(p.userId);
                      const isExpanded = expandedPlayer === p.userId;
                      return (
                        <React.Fragment key={p.userId}>
                          <tr
                            role="button"
                            tabIndex={0}
                            aria-expanded={isExpanded}
                            aria-label={`${p.name} — ${stats.history.length} transactions, ₹${stats.total} in. ${isExpanded ? 'Expanded' : 'Collapsed'}.`}
                            onClick={() => setExpandedPlayer(isExpanded ? null : p.userId)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setExpandedPlayer(isExpanded ? null : p.userId);
                              }
                            }}
                            className={`transition-all group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/60 ${isExpanded ? 'bg-emerald-500/[0.03]' : 'hover:bg-slate-950/50'}`}
                          >
                            <td className="px-4 sm:px-6 py-4 sm:py-5">
                              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-all flex-shrink-0 ${isExpanded ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700'}`}>
                                  {p.name.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-black text-slate-200 truncate">{p.name}</p>
                                  <p className="text-[9px] font-bold text-slate-500 uppercase">{stats.history.length} Transactions</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-4 sm:py-5 text-right font-mono text-emerald-400 font-black text-base sm:text-lg tabular-nums whitespace-nowrap">₹{stats.total}</td>
                            <td className="px-2 sm:px-4 text-slate-700">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-950/40">
                              <td colSpan={3} className="px-4 sm:px-8 py-5 sm:py-6 animate-in slide-in-from-top-2 border-b border-slate-800/50">
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                      <History className="w-3 h-3" /> Player Transaction Log
                                    </p>
                                    <p className="text-[9px] font-black text-emerald-500/50 uppercase">Session Audit</p>
                                  </div>
                                  <div className="space-y-2">
                                    {stats.history.length === 0 ? (
                                      <p className="text-xs text-slate-600 italic py-2">No buy-ins initiated yet</p>
                                    ) : (
                                      stats.history.map(r => (
                                        <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0 group/item">
                                          <div className="flex items-center gap-4">
                                            <div className="text-[10px] font-mono text-slate-600 group-hover/item:text-slate-400 transition-colors">{new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            <div className="text-sm font-black text-slate-100">₹{r.amount}</div>
                                          </div>
                                          <div className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${r.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                            r.status === 'rejected' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                              'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                            }`}>
                                            {r.status}
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Table-wide Global Audit Log */}
          <section className="space-y-4 pt-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Global Table Audit Log
              </h2>
              <span className="text-[9px] font-bold text-slate-600 uppercase">Realtime Feed</span>
            </div>
            <div className="bg-slate-900/50 rounded-[2rem] border border-slate-800 p-2 max-h-80 overflow-y-auto custom-scrollbar shadow-inner">
              {buyIns.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="Feed ready"
                  subtitle="Buy-in activity across every player will stream in here as it happens."
                />
              ) : (
                buyIns.map((b, idx) => {
                  const player = players.find(p => p.userId === b.userId);
                  return (
                    <div key={b.id} className={`flex items-center justify-between p-5 rounded-2xl transition-all hover:bg-white/[0.02] group ${idx % 2 === 0 ? 'bg-slate-950/20' : ''}`}>
                      <div className="flex items-center gap-5">
                        <div className="font-mono text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">
                          {new Date(b.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-200">{player?.name || 'Observer'}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Attempted <span className="text-emerald-400">₹{b.amount}</span></p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border shadow-sm ${b.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          b.status === 'rejected' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                            'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          }`}>
                          {b.status}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
