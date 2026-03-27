'use client';

import React from 'react';
import { useAgent } from '@/lib/agent-context';
import { formatUSD, formatPercent } from '@/lib/utils';

export function ActiveTrades() {
  const { state } = useAgent();

  return (
    <div className="bg-agent-card border border-agent-border rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-400 mb-3">Active Positions</h2>
      {state.activeTrades.length === 0 ? (
        <div className="text-xs text-gray-600 text-center py-4">No active positions</div>
      ) : (
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {state.activeTrades.filter(t => t.status === 'open').slice(0, 8).map((trade) => {
            const isProfit = trade.pnl >= 0;
            return (
              <div
                key={trade.id}
                className="flex items-center justify-between bg-agent-bg/50 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    trade.side === 'long' || trade.side === 'buy'
                      ? 'bg-agent-green/10 text-agent-green'
                      : 'bg-agent-red/10 text-agent-red'
                  }`}>
                    {trade.side.toUpperCase()}
                  </span>
                  <span className="text-xs font-mono text-white">{trade.pair}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-gray-400">
                    {formatUSD(trade.amount)}
                  </span>
                  <span className={`text-xs font-bold font-mono ${isProfit ? 'text-agent-green' : 'text-agent-red'}`}>
                    {formatPercent(trade.pnlPercent)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
