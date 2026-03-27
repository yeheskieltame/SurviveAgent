export type AgentStatus = 'idle' | 'analyzing' | 'executing' | 'waiting' | 'error' | 'success';

export type StrategyType =
  | 'futures'
  | 'polymarket'
  | 'memecoin'
  | 'airdrop'
  | 'arbitrage'
  | 'defi_yield'
  | 'funding_rate';

export interface SubAgent {
  id: string;
  name: string;
  strategy: StrategyType;
  status: AgentStatus;
  description: string;
  icon: string;
  color: string;
  currentTask: string;
  pnl: number;
  pnlPercent: number;
  trades: number;
  winRate: number;
  allocated: number;
  lastAction: string;
  lastActionTime: Date;
}

export interface Trade {
  id: string;
  agentId: string;
  strategy: StrategyType;
  pair: string;
  side: 'long' | 'short' | 'buy' | 'sell';
  amount: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  status: 'open' | 'closed' | 'pending';
  timestamp: Date;
}

export interface TerminalLog {
  id: string;
  timestamp: Date;
  agentId: string;
  agentName: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'trade' | 'analysis';
  message: string;
  details?: string;
}

export interface PortfolioSnapshot {
  timestamp: Date;
  totalValue: number;
  pnl: number;
  pnlPercent: number;
}

export interface AgentState {
  coordinatorStatus: AgentStatus;
  totalBalance: number;
  initialBalance: number;
  totalPnl: number;
  totalPnlPercent: number;
  subAgents: SubAgent[];
  activeTrades: Trade[];
  terminalLogs: TerminalLog[];
  portfolioHistory: PortfolioSnapshot[];
  isRunning: boolean;
}
