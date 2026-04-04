'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface Trade {
  id: string;
  strategy: string;
  platform: string;
  asset: string;
  side: string;
  action_type: string;
  amount: number;
  entry_price: number;
  exit_price: number;
  pnl: number;
  pnl_percent: number;
  fee: number;
  leverage: number;
  confidence: number;
  reasoning: string;
  status: string;
  tx_hash: string;
  opened_at: string;
  closed_at: string;
}

interface Stats {
  totalSessions: number;
  totalTrades: number;
  totalPnl: number;
  winRate: number;
  avgPnlPerTrade: number;
}

interface Session {
  id: string;
  initial_balance: number;
  mode: string;
  claude_available: number;
  started_at: string;
  stopped_at: string;
  final_balance: number;
  final_pnl: number;
  total_trades: number;
}

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tradesRes, statsRes] = await Promise.all([
          fetch('/api/trades?limit=200'),
          fetch('/api/stats'),
        ]);
        if (tradesRes.ok) {
          const t = await tradesRes.json();
          setTrades(t.trades || []);
        }
        if (statsRes.ok) {
          const s = await statsRes.json();
          setStats(s.overall || null);
          setSessions(s.sessions || []);
        }
      } catch {}
      setLoading(false);
    };
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0e17] text-white flex items-center justify-center font-mono">
        <div className="text-gray-400 animate-pulse">Loading trade history...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e17] text-white font-mono">
      <header className="bg-[#111827]/80 border-b border-[#1e293b] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📊</span>
          <div>
            <h1 className="text-lg font-bold">Trade History & Stats</h1>
            <p className="text-[10px] text-gray-500">Paper trading database — all trades with real market data</p>
          </div>
        </div>
        <Link href="/" className="text-xs text-[#3b82f6] hover:text-white transition-colors px-3 py-1 border border-[#1e293b] rounded-lg">
          ← Dashboard
        </Link>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto space-y-6">
        {/* Overall Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Sessions', value: stats.totalSessions, color: 'text-[#3b82f6]' },
              { label: 'Total Trades', value: stats.totalTrades, color: 'text-white' },
              { label: 'Total P&L', value: `$${stats.totalPnl.toFixed(2)}`, color: stats.totalPnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]' },
              { label: 'Win Rate', value: `${stats.winRate.toFixed(1)}%`, color: stats.winRate > 50 ? 'text-[#00ff88]' : 'text-[#ff4444]' },
              { label: 'Avg P&L/Trade', value: `$${stats.avgPnlPerTrade.toFixed(4)}`, color: stats.avgPnlPerTrade >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]' },
            ].map(s => (
              <div key={s.label} className="bg-[#111827] border border-[#1e293b] rounded-xl p-3 text-center">
                <div className="text-[10px] text-gray-500">{s.label}</div>
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Sessions */}
        {sessions.length > 0 && (
          <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Sessions</h2>
            <div className="space-y-2">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center justify-between bg-[#0a0e17]/50 rounded-lg px-3 py-2 text-xs">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${s.stopped_at ? 'bg-gray-600' : 'bg-[#00ff88] animate-pulse'}`} />
                    <span className="text-gray-400">{new Date(s.started_at).toLocaleString()}</span>
                    <span className="text-white">${s.initial_balance}</span>
                    <span className="text-gray-600">→</span>
                    <span className={s.final_pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}>
                      {s.final_balance ? `$${s.final_balance.toFixed(2)}` : 'Running...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{s.total_trades} trades</span>
                    {s.claude_available ? <span className="text-[10px] text-[#a855f7]">🧠 Claude</span> : <span className="text-[10px] text-gray-600">Heuristic</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trade Table */}
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">
            All Trades ({trades.length})
          </h2>
          {trades.length === 0 ? (
            <div className="text-center text-gray-600 py-8">
              No trades recorded yet. Start the agent to begin paper trading.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-[#1e293b]">
                    <th className="text-left py-2 px-2">Time</th>
                    <th className="text-left py-2 px-2">Strategy</th>
                    <th className="text-left py-2 px-2">Asset</th>
                    <th className="text-left py-2 px-2">Side</th>
                    <th className="text-right py-2 px-2">Amount</th>
                    <th className="text-right py-2 px-2">Entry</th>
                    <th className="text-right py-2 px-2">P&L</th>
                    <th className="text-center py-2 px-2">Conf</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Reasoning</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map(t => (
                    <tr key={t.id} className="border-b border-[#1e293b]/50 hover:bg-white/[0.02]">
                      <td className="py-2 px-2 text-gray-400">{new Date(t.opened_at).toLocaleTimeString()}</td>
                      <td className="py-2 px-2 text-gray-300">{t.strategy}</td>
                      <td className="py-2 px-2 text-white font-semibold">{t.asset}</td>
                      <td className="py-2 px-2">
                        <span className={`px-1.5 py-0.5 rounded ${
                          t.side === 'long' || t.side === 'buy' ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'bg-[#ff4444]/10 text-[#ff4444]'
                        }`}>
                          {t.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-gray-300">${t.amount.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right text-gray-400">
                        {t.entry_price ? `$${t.entry_price.toFixed(2)}` : '-'}
                      </td>
                      <td className={`py-2 px-2 text-right font-bold ${t.pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                        {t.pnl !== 0 ? `${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(4)}` : '-'}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className={`${t.confidence > 70 ? 'text-[#00ff88]' : t.confidence > 50 ? 'text-[#fbbf24]' : 'text-gray-500'}`}>
                          {t.confidence}%
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          t.status === 'open' ? 'bg-[#3b82f6]/10 text-[#3b82f6]' : 'bg-gray-800 text-gray-500'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-gray-500 max-w-[200px] truncate" title={t.reasoning}>
                        {t.reasoning || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
