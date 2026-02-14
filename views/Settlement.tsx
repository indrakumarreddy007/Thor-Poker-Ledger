
import React, { useMemo } from 'react';
import { User, Settlement as SettlementType } from '../types';
import { api } from '../services/api';
import { ArrowRight, Trophy, Coins, CheckCircle2 } from 'lucide-react';

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
        // Filter buyins for approved only, if needed for 'data' state used in calculation
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

    // Safety copy to avoid mutating memoized state
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
    <div className="text-center py-20 text-slate-500">
      Session data unavailable. <button onClick={() => navigate('home')} className="text-emerald-500 font-bold">Return Home</button>
    </div>
  );

  return (
    <div className="space-y-8 animate-in zoom-in-95 duration-500">
      <div className="text-center space-y-2">
        <Trophy className="w-12 h-12 text-amber-500 mx-auto" />
        <h1 className="text-3xl font-black text-white">{data.session.name} Ended</h1>
        <p className="text-slate-500">Final results and settlements</p>
      </div>

      <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Coins className="w-4 h-4" /> Performance Ledger
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-950/50">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500">Player</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 text-right">In</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 text-right">Out</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {results.map(r => (
                <tr key={r.userId} className={`${r.userId === user.id ? 'bg-emerald-500/5' : ''}`}>
                  <td className="px-6 py-4 font-bold text-white">
                    {r.name} {r.userId === user.id && <span className="text-[10px] text-emerald-400 font-normal"> (You)</span>}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-slate-400">₹{r.buyIn}</td>
                  <td className="px-6 py-4 text-right font-mono text-slate-200">₹{r.winnings}</td>
                  <td className={`px-6 py-4 text-right font-mono font-bold ${r.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {r.net >= 0 ? `+₹${r.net}` : `-₹${Math.abs(r.net)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-emerald-500 rounded-3xl p-6 shadow-xl shadow-emerald-500/10 text-slate-950">
        <h2 className="text-xl font-black mb-6 flex items-center gap-2">
          <CheckCircle2 className="w-6 h-6" />
          Settlements (Who pays whom)
        </h2>
        <div className="space-y-3">
          {settlements.length === 0 ? (
            <p className="text-center font-bold py-4">No payments needed. Everyone broke even!</p>
          ) : (
            settlements.map((s, i) => (
              <div key={i} className="flex items-center justify-between bg-white/20 backdrop-blur-sm p-4 rounded-2xl border border-white/30">
                <span className="font-bold flex-1">{s.from}</span>
                <div className="flex flex-col items-center px-4">
                  <span className="text-lg font-black leading-tight">₹{s.amount}</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
                <span className="font-bold flex-1 text-right">{s.to}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="flex justify-center pt-4">
        <button
          onClick={() => navigate('home')}
          className="px-8 py-4 bg-slate-900 border border-slate-800 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl active:scale-95 text-white"
        >
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
