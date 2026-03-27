'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useAgent } from '@/lib/agent-context';
import { formatUSD, formatPercent } from '@/lib/utils';

export function PnLChart() {
  const { state } = useAgent();
  const { portfolioHistory, totalBalance, totalPnl, totalPnlPercent, initialBalance } = state;

  const chartData = portfolioHistory.map((snapshot, i) => ({
    time: i,
    value: snapshot.totalValue,
    pnl: snapshot.pnl,
  }));

  const isProfit = totalPnl >= 0;
  const gradientColor = isProfit ? '#00ff88' : '#ff4444';

  return (
    <div className="bg-agent-card border border-agent-border rounded-xl p-4 h-full">
      {/* Header Stats */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm text-gray-400 font-medium">Portfolio Value</h2>
          <div className="text-3xl font-bold text-white font-mono">
            {formatUSD(totalBalance)}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold font-mono ${isProfit ? 'text-agent-green' : 'text-agent-red'}`}>
            {formatUSD(totalPnl)}
          </div>
          <div className={`text-sm font-mono ${isProfit ? 'text-agent-green' : 'text-agent-red'}`}>
            {formatPercent(totalPnlPercent)}
          </div>
        </div>
      </div>

      {/* Mini Stats Row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-agent-bg/50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500">Initial</div>
          <div className="text-sm font-mono text-white">{formatUSD(initialBalance)}</div>
        </div>
        <div className="bg-agent-bg/50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500">Active Trades</div>
          <div className="text-sm font-mono text-agent-blue">{state.activeTrades.length}</div>
        </div>
        <div className="bg-agent-bg/50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500">Win Rate</div>
          <div className="text-sm font-mono text-agent-yellow">
            {state.subAgents.length > 0
              ? (state.subAgents.reduce((s, a) => s + a.winRate, 0) / state.subAgents.filter(a => a.winRate > 0).length || 0).toFixed(1)
              : '0'}%
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={gradientColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={gradientColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="time"
              stroke="#4b5563"
              tick={{ fontSize: 10 }}
              tickFormatter={() => ''}
            />
            <YAxis
              stroke="#4b5563"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(v) => `$${v.toFixed(0)}`}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
              }}
              formatter={(value) => [formatUSD(Number(value)), 'Value']}
              labelFormatter={() => ''}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={gradientColor}
              strokeWidth={2}
              fill="url(#pnlGradient)"
              animationDuration={300}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
