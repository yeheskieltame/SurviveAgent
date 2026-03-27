'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AgentEngine } from './agent-engine';
import { AgentState } from '@/types/agent';

interface AgentContextType {
  state: AgentState;
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  setInitialBalance: (balance: number) => void;
}

const AgentContext = createContext<AgentContextType | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef<AgentEngine | null>(null);
  const [initialBalance, setInitialBalanceState] = useState(1000);
  const [state, setState] = useState<AgentState | null>(null);

  useEffect(() => {
    const engine = new AgentEngine(initialBalance);
    engineRef.current = engine;
    setState(engine.getState());

    const unsubscribe = engine.subscribe((newState) => {
      setState({ ...newState });
    });

    return () => {
      unsubscribe();
      engine.destroy();
    };
  }, [initialBalance]);

  const start = useCallback(() => {
    engineRef.current?.start();
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  const setInitialBalance = useCallback((balance: number) => {
    engineRef.current?.stop();
    setInitialBalanceState(balance);
  }, []);

  if (!state) return null;

  return (
    <AgentContext.Provider value={{ state, isRunning: state.isRunning, start, stop, setInitialBalance }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgent must be used within AgentProvider');
  return ctx;
}
