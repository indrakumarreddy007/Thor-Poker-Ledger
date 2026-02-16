
import React, { useState, useEffect } from 'react';
import { User, Session, SessionPlayer, BuyIn, CashOut } from '../types';
import { api } from '../services/api';
import { Check, X, Users, Wallet, Trophy, Plus, DollarSign, AlertTriangle, History, ChevronDown, ChevronUp, Clock, ShieldCheck, PenSquare, Trash2, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface SessionAdminProps {
  user: User;
  sessionCode: string;
  navigate: (path: string) => void;
}

type Transaction = (BuyIn & { type: 'buyin' }) | (CashOut & { type: 'cashout' });

export default function SessionAdmin({ user, sessionCode, navigate }: SessionAdminProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [buyIns, setBuyIns] = useState<BuyIn[]>([]);
  const [cashOuts, setCashOuts] = useState<CashOut[]>([]);
  const [isEnding, setIsEnding] = useState(false);
  const [isAddingOwn, setIsAddingOwn] = useState(false);
  const [ownAmount, setOwnAmount] = useState('');

  // Cash Out State
  const [isCashingOut, setIsCashingOut] = useState<string | null>(null); // userId
  const [cashOutAmount, setCashOutAmount] = useState('');

  // Edit Transaction State
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');

  const [finalChipCounts, setFinalChipCounts] = useState<Record<string, string>>({});
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [fetchError, setFetchError] = useState('');

  const refreshData = async () => {
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
        setBuyIns(data.buyIns);
        setCashOuts(data.cashOuts || []);
        setFetchError('');
      } else {
        console.error("Failed to fetch session data (data is null)");
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
    await api.updateBuyInStatus(id, 'approved');
    refreshData();
  };

  const handleReject = async (id: string) => {
    await api.updateBuyInStatus(id, 'rejected');
    refreshData();
  };

  const handleAdminBuyIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !ownAmount) return;
    await api.requestBuyIn(session.id, user.id, parseFloat(ownAmount), 'approved');
    setOwnAmount('');
    setIsAddingOwn(false);
    refreshData();
  };

  const handleCashOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !isCashingOut || !cashOutAmount) return;
    await api.cashOut(session.id, isCashingOut, parseFloat(cashOutAmount));
    setCashOutAmount('');
    setIsCashingOut(null);
    refreshData();
  };

  const handleEditTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransaction || !editAmount) return;

    if (editingTransaction.type === 'buyin') {
      await api.updateBuyInAmount(editingTransaction.id, parseFloat(editAmount));
    } else {
      await api.updateCashOut(editingTransaction.id, parseFloat(editAmount));
    }
    setEditingTransaction(null);
    setEditAmount('');
    refreshData();
  };

  const handleDeleteTransaction = async (t: Transaction) => {
    if (!confirm(`Are you sure you want to revert this ${t.type === 'buyin' ? 'Buy-In' : 'Cash-Out'} of ₹${t.amount}?`)) return;

    if (t.type === 'buyin') {
      await api.deleteBuyIn(t.id);
    } else {
      await api.deleteCashOut(t.id);
    }
    refreshData();
  };

  const startEditing = (t: Transaction) => {
    setEditingTransaction(t);
    setEditAmount(t.amount.toString());
  };

  const getPlayerStats = (userId: string) => {
    const playerBuyIns = buyIns.filter(b => b.userId === userId && b.status === 'approved');
    const playerCashOuts = cashOuts.filter(c => c.userId === userId);

    const totalBuyIn = playerBuyIns.reduce((sum, b) => sum + b.amount, 0);
    const totalCashOut = playerCashOuts.reduce((sum, c) => sum + c.amount, 0);

    // Merge history
    const history: Transaction[] = [
      ...buyIns.filter(b => b.userId === userId).map(b => ({ ...b, type: 'buyin' } as Transaction)),
      ...cashOuts.filter(c => c.userId === userId).map(c => ({ ...c, type: 'cashout' } as Transaction))
    ].sort((a, b) => b.timestamp - a.timestamp);

    return { totalBuyIn, totalCashOut, history };
  };

  const finalizeSession = async () => {
    if (!session) return;
    let totalWinnings = 0;
    const approvedBuyIns = buyIns.filter(b => b.status === 'approved');
    const totalBuyInPool = approvedBuyIns.reduce((sum, b) => sum + b.amount, 0);
    const totalCashOutsAlready = cashOuts.reduce((sum, c) => sum + c.amount, 0);

    // Calculate effective stack for staying players
    for (const player of players) {
      const val = parseFloat(finalChipCounts[player.userId] || '0');
      // If a player has chips on table, we treat it as a final cashout for settlement calc
      // So Final Winnings = (Previous Cashouts + Current Stack)
      // The backend settlement logic stores 'final_winnings' which is usually net or total returned?
      // existing 'settlePlayer' calls 'UPDATE session_players SET final_winnings = $1'
      // If I interpret 'final_winnings' as 'Total Amount Player Leaves With' (Stack + Cashouts)

      const stats = getPlayerStats(player.userId);
      const totalReturned = stats.totalCashOut + val; // Cashouts made + Chips on table

      totalWinnings += val; // We verify chips on table vs (Pool - Cashouts) ?
      // No, Pool = BuyIns.
      // Total Money Out = Cashouts + Chips on Table.
      // So (Total Cashouts + Total Chips on Table) should equal Total BuyIns.

      // We pass the 'val' (chips on table) to backend? 
      // Or we pass 'totalReturned'?
      // session_players table has 'final_winnings'.
      // Usually settlement view calculates Net = Final - BuyIn.
      // So we should store the Total Returned (Chips + Cashouts) or just Chips and let backend sum?
      // The current backend 'settle.ts' just updates 'final_winnings' column.
      // Let's assume 'final_winnings' column tracks "Total Value Extracted from Game".
      // So we should pass (val + totalCashOut).

      // WAIT: If I cash out 500 mid session, I have 500 in my pocket.
      // If I leave with 0 chips, my total return is 500.
      // So yes, fetch stats.totalCashOut + val.

      await api.settlePlayer(session.id, player.userId, totalReturned);
    }

    const totalChipsOnTable = Object.values(finalChipCounts).reduce((sum, v) => sum + parseFloat(v || '0'), 0);
    const totalOut = totalCashOutsAlready + totalChipsOnTable;

    if (Math.abs(totalOut - totalBuyInPool) > 0.1) {
      setError(`Audit Failed: Total Out (Cashouts ₹${totalCashOutsAlready} + Table ₹${totalChipsOnTable} = ₹${totalOut}) ≠ Pool (₹${totalBuyInPool}).`);
      return;
    }

    await api.updateSessionStatus(session.id, 'closed');
    navigate(`settlement/${session.id}`);
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
      <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-2xl border-t-emerald-500/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-black text-white flex items-center gap-3">
              {session.name}
              <span className="text-[10px] bg-emerald-500 text-slate-950 px-2.5 py-1 rounded-full uppercase tracking-tighter font-black">Host</span>
            </h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Access Code:</span>
                <span className="font-mono text-emerald-400 font-black bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 select-all">{session.sessionCode}</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-slate-700"></div>
              <span className="text-xs text-slate-400 font-medium">Blinds: {session.blindValue}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setIsAddingOwn(!isAddingOwn)}
              className="flex-1 md:flex-none bg-slate-800 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 px-5 py-3 rounded-2xl font-black transition-all flex items-center justify-center gap-2 border border-slate-700"
            >
              <Plus className="w-4 h-4" /> Buy-In
            </button>
            <button
              onClick={() => setIsEnding(true)}
              className="flex-1 md:flex-none bg-rose-500 hover:bg-rose-600 text-white px-6 py-3 rounded-2xl font-black transition-all shadow-xl shadow-rose-500/30 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" /> End Session
            </button>
          </div>
        </div>
      </div>

      {isAddingOwn && (
        <form onSubmit={handleAdminBuyIn} className="bg-emerald-500/5 border-2 border-emerald-500/20 p-6 rounded-[2rem] animate-in zoom-in-95 flex items-center gap-4">
          <div className="flex-1 relative">
            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500" />
            <input
              type="number"
              autoFocus
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-emerald-500 outline-none font-black text-xl text-white"
              placeholder="0.00"
              value={ownAmount}
              onChange={(e) => setOwnAmount(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-emerald-500 text-slate-950 px-8 py-4 rounded-xl font-black shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">Add Stack</button>
          <button type="button" onClick={() => setIsAddingOwn(false)} className="p-4 text-slate-500 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
        </form>
      )}

      {/* Cash Out Modal */}
      {isCashingOut && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCashOut} className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] w-full max-w-md space-y-6 shadow-2xl animate-in zoom-in-95">
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white">Mid-Session Cash Out</h3>
              <p className="text-sm text-slate-400">Recording cash out for <span className="text-emerald-400 font-bold">{players.find(p => p.userId === isCashingOut)?.name}</span></p>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
              <input
                type="number"
                autoFocus
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-4 focus:ring-2 focus:ring-emerald-500 outline-none font-black text-xl text-white"
                placeholder="0.00"
                value={cashOutAmount}
                onChange={(e) => setCashOutAmount(e.target.value)}
              />
            </div>
            <div className="flex gap-4">
              <button type="button" onClick={() => setIsCashingOut(null)} className="flex-1 py-4 bg-slate-800 rounded-xl font-bold text-slate-400 hover:bg-slate-700">Cancel</button>
              <button type="submit" className="flex-1 py-4 bg-emerald-500 text-slate-950 rounded-xl font-black hover:bg-emerald-400">Confirm Cash Out</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editingTransaction && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleEditTransaction} className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] w-full max-w-md space-y-6 shadow-2xl animate-in zoom-in-95">
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white">Edit {editingTransaction.type === 'buyin' ? 'Buy-In' : 'Cash-Out'}</h3>
              <p className="text-sm text-slate-400">Updating amount for this transaction.</p>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
              <input
                type="number"
                autoFocus
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-4 focus:ring-2 focus:ring-amber-500 outline-none font-black text-xl text-white"
                placeholder="0.00"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </div>
            <div className="flex gap-4">
              <button type="button" onClick={() => setEditingTransaction(null)} className="flex-1 py-4 bg-slate-800 rounded-xl font-bold text-slate-400 hover:bg-slate-700">Cancel</button>
              <button type="submit" className="flex-1 py-4 bg-amber-500 text-slate-950 rounded-xl font-black hover:bg-amber-400">Update Amount</button>
            </div>
          </form>
        </div>
      )}

      {isEnding ? (
        <div className="bg-slate-900 border-2 border-amber-500/50 rounded-[2.5rem] p-8 space-y-6 animate-in slide-in-from-top-4 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center">
              <Trophy className="text-amber-500 w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Final Chip Count</h2>
              <p className="text-sm text-slate-400 font-medium">Verify chips on table. Total Pool: ₹{buyIns.filter(b => b.status === 'approved').reduce((s, b) => s + b.amount, 0)}</p>
            </div>
          </div>

          <div className="space-y-3">
            {players.map(p => {
              const stats = getPlayerStats(p.userId);
              return (
                <div key={p.userId} className="flex items-center justify-between p-5 bg-slate-950 rounded-2xl border border-slate-800 focus-within:border-amber-500/50 transition-all group">
                  <div>
                    <span className="font-black text-slate-200 block">{p.name}</span>
                    <div className="flex gap-3 text-[10px] uppercase font-bold text-slate-500">
                      <span>In: ₹{stats.totalBuyIn}</span>
                      <span className="text-emerald-500">Out: ₹{stats.totalCashOut}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-600 font-bold">₹</span>
                    <input
                      type="number"
                      className="w-32 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-right focus:ring-2 focus:ring-amber-500 outline-none font-black text-white"
                      placeholder="0"
                      value={finalChipCounts[p.userId] || ''}
                      onChange={(e) => setFinalChipCounts(prev => ({ ...prev, [p.userId]: e.target.value }))}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {error && <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-bold flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" /> {error}
          </div>}

          <div className="flex gap-4 pt-4">
            <button onClick={() => setIsEnding(false)} className="flex-1 py-5 bg-slate-800 hover:bg-slate-700 rounded-2xl font-black transition-all text-white">Cancel</button>
            <button onClick={finalizeSession} className="flex-1 py-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-2xl font-black transition-all shadow-2xl shadow-emerald-500/20">Finalize & Settle</button>
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
                  <div className="text-center py-16 bg-slate-900/30 rounded-[2rem] border-2 border-dashed border-slate-800/50 text-slate-600 font-bold italic flex flex-col items-center gap-2">
                    <ShieldCheck className="w-8 h-8 opacity-20" />
                    No pending requests
                  </div>
                ) : (
                  pendingBuyIns.map(b => (
                    <div key={b.id} className="group flex items-center justify-between bg-slate-900 border border-slate-800 p-6 rounded-3xl hover:border-emerald-500/30 transition-all shadow-xl animate-in slide-in-from-left-4">
                      <div>
                        <p className="font-black text-slate-200 text-lg">{players.find(p => p.userId === b.userId)?.name}</p>
                        <p className="text-emerald-400 text-3xl font-black tracking-tighter mt-1">₹{b.amount}</p>
                        <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">{new Date(b.timestamp).toLocaleTimeString()}</p>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => handleReject(b.id)} className="p-4 bg-slate-800 hover:bg-rose-500 text-slate-500 hover:text-white rounded-2xl transition-all shadow-lg active:scale-90"><X className="w-6 h-6" /></button>
                        <button onClick={() => handleApprove(b.id)} className="p-4 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 rounded-2xl transition-all shadow-lg active:scale-90"><Check className="w-6 h-6" /></button>
                      </div>
                    </div>
                  ))
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
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Player</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Net Stack</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {players.map(p => {
                      const stats = getPlayerStats(p.userId);
                      const isExpanded = expandedPlayer === p.userId;
                      return (
                        <React.Fragment key={p.userId}>
                          <tr
                            onClick={() => setExpandedPlayer(isExpanded ? null : p.userId)}
                            className={`transition-all group cursor-pointer ${isExpanded ? 'bg-emerald-500/[0.03]' : 'hover:bg-slate-950/50'}`}
                          >
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-all ${isExpanded ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700'}`}>
                                  {p.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-black text-slate-200">{p.name}</p>
                                  <p className="text-[9px] font-bold text-slate-500 uppercase">{stats.history.length} txns</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5 text-right">
                              <span className="font-mono text-emerald-400 font-black text-lg block">In: ₹{stats.totalBuyIn}</span>
                              {stats.totalCashOut > 0 && <span className="font-mono text-slate-500 font-bold text-xs block">Out: ₹{stats.totalCashOut}</span>}
                            </td>
                            <td className="px-4 text-slate-700">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-950/40">
                              <td colSpan={3} className="px-8 py-6 animate-in slide-in-from-top-2 border-b border-slate-800/50">
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setIsCashingOut(p.userId); }}
                                      className="bg-slate-800 hover:bg-emerald-500 text-slate-300 hover:text-slate-950 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2"
                                    >
                                      <Wallet className="w-3 h-3" /> Cash Out Chips
                                    </button>
                                  </div>

                                  <div className="space-y-2">
                                    {stats.history.length === 0 ? (
                                      <p className="text-xs text-slate-600 italic py-2">No buy-ins initiated yet</p>
                                    ) : (
                                      stats.history.map(r => (
                                        <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0 group/item">
                                          <div className="flex items-center gap-4">
                                            <div className={`p-1.5 rounded-lg ${r.type === 'buyin' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                              {r.type === 'buyin' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                                            </div>
                                            <div>
                                              <div className="text-[10px] font-mono text-slate-600">{new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                              <div className="text-xs font-bold text-slate-400 uppercase">{r.type === 'buyin' ? 'Buy-In' : 'Cash-Out'}</div>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-4">
                                            <div className="text-sm font-black text-slate-100">₹{r.amount}</div>
                                            <div className="flex opacity-0 group-hover/item:opacity-100 transition-opacity gap-1">
                                              {(r.type === 'cashout' || (r.type === 'buyin' && r.status !== 'rejected')) && (
                                                // Allow editing any approved/pending transaction
                                                <>
                                                  <button onClick={() => startEditing(r)} className="p-1.5 text-slate-500 hover:text-amber-500 transition-colors"><PenSquare className="w-3 h-3" /></button>
                                                  <button onClick={() => handleDeleteTransaction(r)} className="p-1.5 text-slate-500 hover:text-rose-500 transition-colors"><Trash2 className="w-3 h-3" /></button>
                                                </>
                                              )}
                                            </div>
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
              {/* Merge all transactions for feed */}
              {(() => {
                const allTxns: Transaction[] = [
                  ...buyIns.map(b => ({ ...b, type: 'buyin' } as Transaction)),
                  ...cashOuts.map(c => ({ ...c, type: 'cashout' } as Transaction))
                ].sort((a, b) => b.timestamp - a.timestamp);

                if (allTxns.length === 0) return (
                  <div className="py-20 text-center text-slate-700 text-[10px] font-black uppercase tracking-widest flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full border border-slate-800 flex items-center justify-center opacity-20">♠</div>
                    Feed Ready
                  </div>
                );

                return allTxns.map((t, idx) => {
                  const player = players.find(p => p.userId === t.userId);
                  return (
                    <div key={t.id} className={`flex items-center justify-between p-5 rounded-2xl transition-all hover:bg-white/[0.02] group ${idx % 2 === 0 ? 'bg-slate-950/20' : ''}`}>
                      <div className="flex items-center gap-5">
                        <div className="font-mono text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">
                          {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-200">{player?.name || 'Observer'}</p>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold uppercase ${t.type === 'buyin' ? 'text-emerald-500' : 'text-amber-500'}`}>{t.type === 'buyin' ? 'Buy-In' : 'Cash-Out'}</span>
                            <span className="text-[10px] text-slate-500 font-bold uppercase">₹{t.amount}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {t.type === 'buyin' && (
                          <div className={`text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border shadow-sm ${t.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            t.status === 'rejected' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                              'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            }`}>
                            {t.status}
                          </div>
                        )}
                        {t.type === 'cashout' && (
                          <div className="text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border shadow-sm bg-slate-800 text-slate-400 border-slate-700">
                            Recorded
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
