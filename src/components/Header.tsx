'use client';

import React, { useState } from 'react';
import { useAgent } from '@/lib/agent-context';

export function Header() {
  const { isRunning, start, stop, setInitialBalance } = useAgent();
  const [balanceInput, setBalanceInput] = useState('1000');
  const [showSettings, setShowSettings] = useState(false);

  const handleStart = () => {
    const balance = parseFloat(balanceInput);
    if (balance > 0) {
      setInitialBalance(balance);
      setTimeout(() => start(), 100);
    }
  };

  return (
    <header className="bg-agent-card/80 backdrop-blur-sm border-b border-agent-border px-6 py-3 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="text-2xl">🧬</div>
          {isRunning && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-agent-green rounded-full animate-pulse" />
          )}
        </div>
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">
            SurviveAgent
          </h1>
          <p className="text-[10px] text-gray-500">Autonomous Web3 Trading System • Powered by Claude</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {!isRunning && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded border border-agent-border hover:border-gray-500"
              >
                ⚙️ Config
              </button>
              {showSettings && (
                <div className="absolute right-0 top-full mt-2 bg-agent-card border border-agent-border rounded-lg p-3 shadow-xl z-50 w-48">
                  <label className="text-[10px] text-gray-500 block mb-1">Initial USDC Balance</label>
                  <input
                    type="number"
                    value={balanceInput}
                    onChange={(e) => setBalanceInput(e.target.value)}
                    className="w-full bg-agent-bg border border-agent-border rounded px-2 py-1 text-sm text-white font-mono focus:outline-none focus:border-agent-green"
                    min="10"
                    step="100"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <button
          onClick={isRunning ? stop : handleStart}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
            isRunning
              ? 'bg-agent-red/20 text-agent-red border border-agent-red/30 hover:bg-agent-red/30'
              : 'bg-agent-green/20 text-agent-green border border-agent-green/30 hover:bg-agent-green/30 animate-glow'
          }`}
        >
          {isRunning ? '■ Stop Agent' : '▶ Deploy Agent'}
        </button>
      </div>
    </header>
  );
}
