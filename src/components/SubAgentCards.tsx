'use client';

import React from 'react';
import { useAgent } from '@/lib/agent-context';
import { formatUSD, formatPercent } from '@/lib/utils';
import { AgentStatus } from '@/types/agent';

const STATUS_STYLES: Record<AgentStatus, { dot: string; label: string }> = {
  idle: { dot: 'bg-gray-500', label: 'Idle' },
  analyzing: { dot: 'bg-agent-blue animate-pulse', label: 'Analyzing' },
  executing: { dot: 'bg-agent-yellow animate-pulse', label: 'Executing' },
  waiting: { dot: 'bg-gray-400', label: 'Waiting' },
  error: { dot: 'bg-agent-red animate-pulse', label: 'Error' },
  success: { dot: 'bg-agent-green', label: 'Success' },
};

export function SubAgentCards() {
  const { state } = useAgent();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {state.subAgents.map((agent) => {
        const isProfit = agent.pnl >= 0;
        const statusStyle = STATUS_STYLES[agent.status];

        return (
          <div
            key={agent.id}
            className="bg-agent-card border border-agent-border rounded-xl p-3 hover:border-gray-600 transition-all duration-300"
            style={{ borderLeftColor: agent.color, borderLeftWidth: '3px' }}
          >
            {/* Agent Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{agent.icon}</span>
                <div>
                  <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                    <span className="text-[10px] text-gray-500">{statusStyle.label}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-bold font-mono ${isProfit ? 'text-agent-green' : 'text-agent-red'}`}>
                  {formatUSD(agent.pnl)}
                </div>
                <div className={`text-[10px] font-mono ${isProfit ? 'text-agent-green' : 'text-agent-red'}`}>
                  {formatPercent(agent.pnlPercent)}
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-1 mb-2">
              <div className="text-center">
                <div className="text-[10px] text-gray-500">Allocated</div>
                <div className="text-xs font-mono text-gray-300">{formatUSD(agent.allocated)}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-gray-500">Trades</div>
                <div className="text-xs font-mono text-gray-300">{agent.trades}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-gray-500">Win Rate</div>
                <div className="text-xs font-mono text-agent-yellow">
                  {agent.winRate > 0 ? `${agent.winRate.toFixed(0)}%` : '-'}
                </div>
              </div>
            </div>

            {/* Current Task */}
            <div className="bg-agent-bg/50 rounded-lg px-2 py-1.5">
              <div className="text-[10px] text-gray-500 mb-0.5">Current Task</div>
              <div className="text-xs text-gray-400 truncate">{agent.currentTask}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
