
import React, { useMemo } from 'react';
import { User, Settlement as SettlementType } from '../types';
import { api } from '../services/api';
import { ArrowRight, Trophy, Coins, CheckCircle2, Crown, Home } from 'lucide-react';

interface SettlementProps {
  user: User;
  sessionId: string;
  navigate: (path: string) => void;
}

export default function Settlement({ user, sessionId, navigate }: SettlementProps) {
  const [data, setData] = React.useState<{ session: any; players: any[]; buyIns: any[] }>({ session: null, players: [], buyIns: [] });

  React.useEffect(() => {
    const fetchData = async () => {
      const result = await api.getSession(sessionId);
      if (result) {
        const approvedBuyIns = result.buyIns.filter(b => b.status === 'approved');
        setData({ session: result.session, players: result.players, buyIns: approvedBuyIns });
      }
    };
    fetchData();
  }, [sessionId]);

  const results = useMemo(() => {
    const { players, buyIns } = data;

    return players.map(p => {
      const playerBuyIn = buyIns.filter(b => b.userId === p.userId).reduce((sum, b) => sum + b.amount, 0);
      const winnings = p.finalWinnings || 0;
      const net = winnings - playerBuyIn;
      return {
        userId: p.userId,
        name: p.name,
        buyIn: playerBuyIn,
        winnings,
        net
      };
    }).sort((a, b) => b.net - a.net);
  }, [data]);

  const settlements = useMemo((): SettlementType[] => {
    const givers = results.filter(r => r.net < 0).map(r => ({ ...r, net: Math.abs(r.net) }));
    const receivers = results.filter(r => r.net > 0).map(r => ({ ...r }));

    const transactions: SettlementType[] = [];

    let gIdx = 0;
    let rIdx = 0;

    const currentGivers = givers.map(g => ({ ...g }));
    const currentReceivers = receivers.map(r => ({ ...r }));

    while (gIdx < currentGivers.length && rIdx < currentReceivers.length) {
      const giver = currentGivers[gIdx];
      const receiver = currentReceivers[rIdx];

      const payment = Math.min(giver.net, receiver.net);
      if (payment > 0) {
        transactions.push({
          from: giver.name,
          to: receiver.name,
          amount: Math.round(payment * 100) / 100
        });
      }

      giver.net -= payment;
      receiver.net -= payment;

      if (giver.net < 0.01) gIdx++;
      if (receiver.net < 0.01) rIdx++;
    }

    return transactions;
  }, [results]);

  if (!data.session) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 animate-slide">
      <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Session data unavailable</p>
      <button
        type="button"
        onClick={() => navigate('home')}
        className="px-6 py-2 bg-slate-900 border border-slate-800 rounded-full text-xs font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 hover:border-emerald-500 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
      >
        Return to Lobby
      </button>
    </div>
  );

  const totalPool = results.reduce((sum, r) => sum + r.buyIn, 0);
  const topWinnerId = results.length > 0 && results[0].net > 0 ? results[0].userId : null;

  return (
    <div className="space-y-6 animate-in zoom-in-95 duration-500 pb-12">
      <header className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 shadow-xl shadow-amber-500/10">
          <Trophy className="w-8 h-8 text-amber-400" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-black text-amber-400/80 uppercase tracking-[0.3em]">Session Settled</p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-white drop-shadow-2xl">{data.session.name}</h1>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">
            Final Pool <span className="text-slate-300">₹{totalPool.toLocaleString()}</span>
          </p>
        </div>
      </header>

      <section className="glass rounded-[2rem] overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <Coins className="w-3.5 h-3.5" aria-hidden="true" /> Performance Ledger
          </h2>
          <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
            {results.length} {results.length === 1 ? 'Player' : 'Players'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-950/40">
              <tr>
                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Player</th>
                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">In</th>
                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Out</th>
                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {results.map(r => {
                const isSelf = r.userId === user.id;
                const isTop = r.userId === topWinnerId;
                const netPositive = r.net >= 0;
                return (
                  <tr
                    key={r.userId}
                    className={`transition-colors ${isSelf ? 'bg-emerald-500/[0.06]' : 'hover:bg-white/[0.02]'}`}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        {isTop && (
                          <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" aria-label="Top winner" />
                        )}
                        <span className="font-black text-slate-100 truncate">{r.name}</span>
                        {isSelf && (
                          <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">You</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-slate-400 tabular-nums">₹{r.buyIn}</td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-slate-200 tabular-nums">₹{r.winnings}</td>
                    <td className={`px-5 py-4 text-right font-mono font-black text-sm tabular-nums ${netPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {netPositive ? `+₹${r.net}` : `-₹${Math.abs(r.net)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass rounded-[2rem] border border-emerald-500/20 shadow-xl shadow-emerald-500/5 overflow-hidden">
        <div className="px-6 py-4 border-b border-emerald-500/10 flex items-center justify-between">
          <h2 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Settlements
          </h2>
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Who Pays Whom</span>
        </div>
        <div className="p-4">
          {settlements.length === 0 ? (
            <p className="text-center font-bold text-slate-400 py-6 text-sm">
              No payments needed. <span className="text-emerald-400">Everyone broke even.</span>
            </p>
          ) : (
            <ul className="space-y-2">
              {settlements.map((s, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 bg-slate-950/60 p-4 rounded-2xl border border-white/[0.04]"
                >
                  <span className="flex-1 font-black text-slate-200 truncate text-sm">{s.from}</span>
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-sm font-black text-emerald-400 tabular-nums">₹{s.amount}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  </div>
                  <span className="flex-1 font-black text-slate-200 truncate text-right text-sm">{s.to}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={() => navigate('home')}
          className="px-8 py-4 bg-slate-900 border border-slate-800 rounded-2xl font-black uppercase tracking-widest text-xs text-slate-200 hover:bg-slate-800 hover:border-slate-700 transition-all shadow-xl active:scale-95 flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
