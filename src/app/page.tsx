'use client';

import React from 'react';
import { AgentProvider } from '@/lib/agent-context';
import { Header } from '@/components/Header';
import { PnLChart } from '@/components/PnLChart';
import { Terminal } from '@/components/Terminal';
import { SubAgentCards } from '@/components/SubAgentCards';
import { ActiveTrades } from '@/components/ActiveTrades';
import { CoordinatorStatus } from '@/components/CoordinatorStatus';

export default function Home() {
  return (
    <AgentProvider>
      <div className="min-h-screen bg-agent-bg grid-bg">
        <Header />

        <main className="p-4 lg:p-6 max-w-[1920px] mx-auto">
          {/* Coordinator Status */}
          <div className="mb-4">
            <CoordinatorStatus />
          </div>

          {/* Main Layout: Chart + Terminal side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Left: P&L Chart */}
            <div className="h-[420px]">
              <PnLChart />
            </div>

            {/* Right: Live Terminal */}
            <div className="h-[420px]">
              <Terminal />
            </div>
          </div>

          {/* Active Trades */}
          <div className="mb-4">
            <ActiveTrades />
          </div>

          {/* Sub-Agent Cards */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
              <span>🤖</span> Sub-Agents
            </h2>
            <SubAgentCards />
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-agent-border py-3 px-6 text-center">
          <p className="text-[10px] text-gray-600">
            SurviveAgent v1.0 • Autonomous Web3 Trading System • Powered by Claude AI
          </p>
        </footer>
      </div>
    </AgentProvider>
  );
}
