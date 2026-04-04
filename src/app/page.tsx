'use client';

import React from 'react';
import { AgentProvider } from '@/lib/agent-context';
import { Header } from '@/components/Header';
import { PnLChart } from '@/components/PnLChart';
import { Terminal } from '@/components/Terminal';
import { ActiveTrades } from '@/components/ActiveTrades';
import { CoordinatorStatus } from '@/components/CoordinatorStatus';
import { MarketDataPanel } from '@/components/MarketDataPanel';
import { StrategyBreakdown } from '@/components/StrategyBreakdown';

export default function Home() {
  return (
    <AgentProvider>
      <div className="min-h-screen bg-agent-bg grid-bg">
        <Header />

        <main className="p-4 lg:p-6 max-w-[1920px] mx-auto space-y-4">
          {/* Live Market Data */}
          <MarketDataPanel />

          {/* Coordinator Status */}
          <CoordinatorStatus />

          {/* Main Layout: Chart + Terminal */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-[420px]">
              <PnLChart />
            </div>
            <div className="h-[420px]">
              <Terminal />
            </div>
          </div>

          {/* Strategy Breakdown + Active Trades */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <StrategyBreakdown />
            <ActiveTrades />
          </div>
        </main>

        <footer className="border-t border-agent-border py-3 px-6 text-center">
          <p className="text-[10px] text-gray-600">
            SurviveAgent v2 • Artemis Architecture • Collectors → Strategies → Executor • Powered by Claude Code CLI
          </p>
        </footer>
      </div>
    </AgentProvider>
  );
}
