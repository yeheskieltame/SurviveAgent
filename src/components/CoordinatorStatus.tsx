'use client';

import React from 'react';
import { useAgent } from '@/lib/agent-context';

export function CoordinatorStatus() {
  const { state } = useAgent();
  const { coordinatorStatus, subAgents } = state;

  const activeAgents = subAgents.filter(a => a.status !== 'idle').length;
  const totalAgents = subAgents.length;

  const statusText: Record<string, string> = {
    idle: 'System Idle',
    analyzing: 'Analyzing Markets...',
    executing: 'Executing Strategies...',
    waiting: 'Waiting for Signals...',
    error: 'Error Detected',
    success: 'Cycle Complete',
  };

  return (
    <div className="bg-agent-card border border-agent-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧠</span>
          <div>
            <h2 className="text-sm font-semibold text-white">Coordinator Agent</h2>
            <p className="text-[10px] text-gray-500">Master orchestrator controlling all sub-agents</p>
          </div>
        </div>
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
          coordinatorStatus === 'analyzing' || coordinatorStatus === 'executing'
            ? 'bg-agent-blue/10 text-agent-blue'
            : coordinatorStatus === 'idle'
            ? 'bg-gray-800 text-gray-500'
            : 'bg-agent-green/10 text-agent-green'
        }`}>
          {statusText[coordinatorStatus]}
        </div>
      </div>

      {/* Agent Status Bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-agent-bg rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-agent-blue to-agent-green rounded-full transition-all duration-1000"
            style={{ width: `${(activeAgents / totalAgents) * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 font-mono">
          {activeAgents}/{totalAgents} active
        </span>
      </div>
    </div>
  );
}
