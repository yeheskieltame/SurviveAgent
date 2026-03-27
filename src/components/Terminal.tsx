'use client';

import React, { useRef, useEffect } from 'react';
import { useAgent } from '@/lib/agent-context';
import { formatTime } from '@/lib/utils';
import { TerminalLog } from '@/types/agent';

const LOG_COLORS: Record<TerminalLog['type'], string> = {
  info: 'text-agent-blue',
  success: 'text-agent-green',
  warning: 'text-agent-yellow',
  error: 'text-agent-red',
  trade: 'text-agent-purple',
  analysis: 'text-agent-cyan',
};

const LOG_PREFIXES: Record<TerminalLog['type'], string> = {
  info: 'INFO',
  success: ' OK ',
  warning: 'WARN',
  error: ' ERR',
  trade: 'TRADE',
  analysis: 'SCAN',
};

export function Terminal() {
  const { state, isRunning } = useAgent();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [state.terminalLogs.length]);

  return (
    <div className="bg-terminal-bg border border-agent-border rounded-xl h-full flex flex-col overflow-hidden">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-agent-border bg-agent-card/50">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-agent-red/80" />
            <div className="w-3 h-3 rounded-full bg-agent-yellow/80" />
            <div className="w-3 h-3 rounded-full bg-agent-green/80" />
          </div>
          <span className="text-xs text-gray-400 font-mono ml-2">survive-agent ~ terminal</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-agent-green animate-pulse' : 'bg-gray-600'}`} />
          <span className="text-xs text-gray-500 font-mono">{isRunning ? 'LIVE' : 'IDLE'}</span>
        </div>
      </div>

      {/* Terminal Body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed space-y-0.5 scrollbar-thin"
      >
        {state.terminalLogs.length === 0 ? (
          <div className="text-gray-600 flex items-center gap-2">
            <span className="animate-pulse">▊</span>
            <span>Waiting for agent initialization...</span>
          </div>
        ) : (
          state.terminalLogs.map((log) => (
            <div key={log.id} className="flex gap-2 hover:bg-white/[0.02] px-1 rounded">
              <span className="text-gray-600 shrink-0">
                {formatTime(log.timestamp)}
              </span>
              <span className={`shrink-0 font-bold ${LOG_COLORS[log.type]}`}>
                [{LOG_PREFIXES[log.type]}]
              </span>
              <span className="text-terminal-text">
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Terminal Input Bar */}
      <div className="border-t border-agent-border px-4 py-2 flex items-center gap-2 bg-agent-card/30">
        <span className="text-agent-green font-mono text-xs">$</span>
        <span className="text-gray-500 font-mono text-xs">
          {isRunning ? 'agent running... ' : 'type "start" to begin'}
        </span>
        <span className="animate-pulse text-agent-green">▊</span>
      </div>
    </div>
  );
}
