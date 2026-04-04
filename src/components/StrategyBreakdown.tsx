'use client';

import React from 'react';
import { useAgent } from '@/lib/agent-context';
import { formatUSD, formatPercent } from '@/lib/utils';

interface StrategyInfo {
  name: string;
  icon: string;
  color: string;
  description: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  dataSource: string;
}

const STRATEGY_INFO: Record<string, StrategyInfo> = {
  futures: {
    name: 'Momentum Trading',
    icon: '📈',
    color: '#3b82f6',
    description: 'Leveraged perp trades on Hyperliquid',
    riskLevel: 'High',
    dataSource: 'Binance WS + Sentiment',
  },
  funding_rate: {
    name: 'Funding Rate Arb',
    icon: '💰',
    color: '#f97316',
    description: 'Delta-neutral funding collection',
    riskLevel: 'Low',
    dataSource: 'Binance + Hyperliquid',
  },
  defi_yield: {
    name: 'DeFi Yield',
    icon: '🌾',
    color: '#22c55e',
    description: 'Auto-rotate best yield pools',
    riskLevel: 'Low',
    dataSource: 'DeFi Llama',
  },
  polymarket: {
    name: 'Polymarket Oracle',
    icon: '🔮',
    color: '#a855f7',
    description: 'AI-assessed prediction markets',
    riskLevel: 'Medium',
    dataSource: 'Gamma API + Claude AI',
  },
  arbitrage: {
    name: 'DEX Arbitrage',
    icon: '⚡',
    color: '#00ff88',
    description: 'Cross-DEX price arbitrage',
    riskLevel: 'Low',
    dataSource: 'Multi-DEX Scanner',
  },
  memecoin: {
    name: 'Memecoin Sniper',
    icon: '🐸',
    color: '#fbbf24',
    description: 'Pump.fun launch detection',
    riskLevel: 'High',
    dataSource: 'Pump.fun + Social',
  },
  airdrop: {
    name: 'Airdrop Farmer',
    icon: '🪂',
    color: '#06b6d4',
    description: 'Protocol interaction farming',
    riskLevel: 'Low',
    dataSource: 'On-chain Activity',
  },
};

const RISK_COLORS = {
  Low: 'text-agent-green',
  Medium: 'text-agent-yellow',
  High: 'text-agent-red',
};

export function StrategyBreakdown() {
  const { state } = useAgent();

  const totalAllocated = state.subAgents.reduce((s, a) => s + a.allocated, 0);

  return (
    <div className="bg-agent-card border border-agent-border rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
        <span>🎯</span> Strategy Allocation
      </h2>

      {/* Allocation Bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-4 bg-agent-bg">
        {state.subAgents.map((agent) => {
          const info = STRATEGY_INFO[agent.strategy];
          const pct = totalAllocated > 0 ? (agent.allocated / totalAllocated) * 100 : 0;
          return (
            <div
              key={agent.id}
              className="h-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: info?.color || '#666' }}
              title={`${info?.name || agent.name}: ${pct.toFixed(1)}%`}
            />
          );
        })}
      </div>

      {/* Strategy Table */}
      <div className="space-y-2">
        {state.subAgents.map((agent) => {
          const info = STRATEGY_INFO[agent.strategy];
          if (!info) return null;
          const pct = totalAllocated > 0 ? (agent.allocated / totalAllocated) * 100 : 0;
          const isProfit = agent.pnl >= 0;

          return (
            <div key={agent.id} className="flex items-center gap-3 bg-agent-bg/30 rounded-lg px-3 py-2">
              <span className="text-lg">{info.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">{info.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${RISK_COLORS[info.riskLevel]} bg-white/5`}>
                    {info.riskLevel}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 truncate">{agent.currentTask}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-mono text-gray-300">{pct.toFixed(0)}% • {formatUSD(agent.allocated)}</div>
                <div className={`text-[10px] font-mono ${isProfit ? 'text-agent-green' : 'text-agent-red'}`}>
                  {formatPercent(agent.pnlPercent)} ({formatUSD(agent.pnl)})
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Data Sources */}
      <div className="mt-3 pt-3 border-t border-agent-border">
        <div className="text-[10px] text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
          <span>📡 Binance WS</span>
          <span>📰 FXTwitter</span>
          <span>📊 CoinGecko</span>
          <span>🌾 DeFi Llama</span>
          <span>💰 Hyperliquid</span>
          <span>🔮 Polymarket</span>
          <span>🧠 Claude AI</span>
        </div>
      </div>
    </div>
  );
}
