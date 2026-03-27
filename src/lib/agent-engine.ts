import { v4 as uuidv4 } from 'uuid';
import {
  AgentState,
  SubAgent,
  TerminalLog,
  Trade,
  StrategyType,
  AgentStatus,
} from '@/types/agent';

export const STRATEGY_CONFIG: Record<StrategyType, {
  name: string;
  description: string;
  icon: string;
  color: string;
  pairs: string[];
  riskLevel: number;
}> = {
  futures: {
    name: 'Futures Trader',
    description: 'Perpetual futures with leverage on major pairs',
    icon: '📈',
    color: '#3b82f6',
    pairs: ['BTC/USDC', 'ETH/USDC', 'SOL/USDC', 'ARB/USDC', 'AVAX/USDC'],
    riskLevel: 0.7,
  },
  polymarket: {
    name: 'Polymarket Oracle',
    description: 'Prediction markets & event-driven trading',
    icon: '🔮',
    color: '#a855f7',
    pairs: ['US Elections', 'Fed Rate', 'ETH ETF', 'BTC ATH', 'Crypto Regulation'],
    riskLevel: 0.5,
  },
  memecoin: {
    name: 'Memecoin Sniper',
    description: 'Early memecoin detection & momentum trading',
    icon: '🐸',
    color: '#fbbf24',
    pairs: ['PEPE/USDC', 'WIF/USDC', 'BONK/USDC', 'DOGE/USDC', 'SHIB/USDC'],
    riskLevel: 0.9,
  },
  airdrop: {
    name: 'Airdrop Farmer',
    description: 'Protocol interaction farming for airdrops',
    icon: '🪂',
    color: '#06b6d4',
    pairs: ['LayerZero', 'zkSync', 'Starknet', 'Scroll', 'Monad'],
    riskLevel: 0.3,
  },
  arbitrage: {
    name: 'Arbitrage Scanner',
    description: 'Cross-DEX & cross-chain price arbitrage',
    icon: '⚡',
    color: '#00ff88',
    pairs: ['ETH Uni↔Sushi', 'USDC Arb↔Op', 'SOL Ray↔Orc', 'BTC CEX↔DEX'],
    riskLevel: 0.2,
  },
  defi_yield: {
    name: 'DeFi Yield Optimizer',
    description: 'Yield farming & liquidity provision optimization',
    icon: '🌾',
    color: '#22c55e',
    pairs: ['Aave ETH', 'Compound USDC', 'Curve 3Pool', 'Lido stETH', 'GMX GLP'],
    riskLevel: 0.3,
  },
  funding_rate: {
    name: 'Funding Rate Arb',
    description: 'Funding rate arbitrage between perp exchanges',
    icon: '💰',
    color: '#f97316',
    pairs: ['BTC Funding', 'ETH Funding', 'SOL Funding', 'DOGE Funding'],
    riskLevel: 0.25,
  },
};

const ALLOCATIONS: Record<StrategyType, number> = {
  futures: 0.25,
  arbitrage: 0.20,
  defi_yield: 0.20,
  funding_rate: 0.15,
  polymarket: 0.08,
  memecoin: 0.05,
  airdrop: 0.07,
};

export function createInitialState(initialBalance: number): AgentState {
  const subAgents = createSubAgents(initialBalance);
  return {
    coordinatorStatus: 'idle',
    totalBalance: initialBalance,
    initialBalance,
    totalPnl: 0,
    totalPnlPercent: 0,
    subAgents,
    activeTrades: [],
    terminalLogs: [],
    portfolioHistory: [{
      timestamp: new Date(),
      totalValue: initialBalance,
      pnl: 0,
      pnlPercent: 0,
    }],
    isRunning: false,
  };
}

function createSubAgents(totalBalance: number): SubAgent[] {
  return (Object.entries(STRATEGY_CONFIG) as [StrategyType, typeof STRATEGY_CONFIG[StrategyType]][]).map(
    ([strategy, config]) => ({
      id: uuidv4(),
      name: config.name,
      strategy,
      status: 'idle' as AgentStatus,
      description: config.description,
      icon: config.icon,
      color: config.color,
      currentTask: 'Waiting for coordinator...',
      pnl: 0,
      pnlPercent: 0,
      trades: 0,
      winRate: 0,
      allocated: totalBalance * (ALLOCATIONS[strategy] || 0.1),
      lastAction: 'Initialized',
      lastActionTime: new Date(),
    })
  );
}

// ===== Mutation helpers for server-side engine =====

export function addLog(
  state: AgentState,
  agentId: string,
  agentName: string,
  type: TerminalLog['type'],
  message: string,
  details?: string
): TerminalLog {
  const log: TerminalLog = {
    id: uuidv4(),
    timestamp: new Date(),
    agentId,
    agentName,
    type,
    message,
    details,
  };
  state.terminalLogs = [log, ...state.terminalLogs].slice(0, 300);
  return log;
}

export function updatePortfolio(state: AgentState) {
  const totalValue = state.subAgents.reduce((sum, a) => sum + a.allocated, 0);
  const totalPnl = totalValue - state.initialBalance;
  const totalPnlPercent = (totalPnl / state.initialBalance) * 100;

  state.totalBalance = totalValue;
  state.totalPnl = totalPnl;
  state.totalPnlPercent = totalPnlPercent;

  state.portfolioHistory.push({
    timestamp: new Date(),
    totalValue,
    pnl: totalPnl,
    pnlPercent: totalPnlPercent,
  });

  if (state.portfolioHistory.length > 200) {
    state.portfolioHistory = state.portfolioHistory.slice(-200);
  }
}

export function applyTradeToAgent(
  state: AgentState,
  agent: SubAgent,
  action: string,
  pnlChange: number,
  tradePair?: string,
  tradeSide?: 'long' | 'short' | 'buy' | 'sell'
) {
  const config = STRATEGY_CONFIG[agent.strategy];

  agent.status = 'executing';
  agent.currentTask = action;
  agent.lastAction = action;
  agent.lastActionTime = new Date();
  agent.pnl += pnlChange;
  agent.allocated += pnlChange;
  if (agent.allocated - agent.pnl !== 0) {
    agent.pnlPercent = (agent.pnl / (agent.allocated - agent.pnl)) * 100;
  }
  agent.trades += 1;
  agent.winRate = agent.trades > 0
    ? Math.min(85, Math.max(35, agent.winRate + (pnlChange > 0 ? 2 : -1)))
    : 0;

  const logType: TerminalLog['type'] = pnlChange > 0 ? 'success' : pnlChange < -5 ? 'warning' : 'trade';
  addLog(state, agent.id, `${config.icon} ${agent.name}`, logType, action);

  if (tradePair) {
    const trade: Trade = {
      id: uuidv4(),
      agentId: agent.id,
      strategy: agent.strategy,
      pair: tradePair,
      side: tradeSide || 'buy',
      amount: Math.abs(pnlChange) * 10,
      entryPrice: 0,
      currentPrice: 0,
      pnl: pnlChange,
      pnlPercent: agent.allocated > 0 ? (pnlChange / agent.allocated) * 100 : 0,
      status: 'open',
      timestamp: new Date(),
    };
    state.activeTrades = [trade, ...state.activeTrades].slice(0, 20);
  }

  updatePortfolio(state);
}

/**
 * Client-side simulation engine (used when Claude CLI is not available)
 * This provides immediate visual feedback while the real backend processes
 */
export class ClientAgentEngine {
  private state: AgentState;
  private listeners: Set<(state: AgentState) => void> = new Set();
  private eventSource: EventSource | null = null;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(initialBalance: number = 1000) {
    this.state = createInitialState(initialBalance);
  }

  getState(): AgentState {
    return { ...this.state };
  }

  subscribe(listener: (state: AgentState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const snapshot = this.getState();
    this.listeners.forEach(fn => fn(snapshot));
  }

  async start() {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    this.state.coordinatorStatus = 'analyzing';

    addLog(this.state, 'coordinator', '🧠 Coordinator', 'info',
      'SurviveAgent system booting...');
    this.notify();

    // Connect to SSE stream from server
    try {
      this.eventSource = new EventSource('/api/stream');

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerEvent(data);
        } catch {
          // ignore parse errors from heartbeats etc
        }
      };

      this.eventSource.onerror = () => {
        addLog(this.state, 'coordinator', '🧠 Coordinator', 'warning',
          'SSE connection lost, falling back to polling...');
        this.notify();
        this.startPolling();
      };
    } catch {
      this.startPolling();
    }

    // Trigger server-side agent start
    try {
      const res = await fetch('/api/agent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialBalance: this.state.initialBalance }),
      });
      const data = await res.json();

      if (data.claudeAvailable) {
        addLog(this.state, 'coordinator', '🧠 Coordinator', 'success',
          'Claude Code brain connected! AI-powered decisions active.');
      } else {
        addLog(this.state, 'coordinator', '🧠 Coordinator', 'warning',
          'Claude CLI not found. Running with real market data + heuristic decisions.');
      }
      addLog(this.state, 'coordinator', '🧠 Coordinator', 'info',
        `Initial capital: $${this.state.initialBalance.toFixed(2)} USDC`);
      addLog(this.state, 'coordinator', '🧠 Coordinator', 'info',
        'Deploying 7 specialized sub-agents. Fetching live market data...');
      this.notify();
    } catch (err) {
      addLog(this.state, 'coordinator', '🧠 Coordinator', 'warning',
        'Server not responding. Running in client-side mode with live data fetch.');
      this.notify();
      this.startClientMode();
    }
  }

  private startPolling() {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/agent/status');
        if (res.ok) {
          const data = await res.json();
          if (data.state) {
            this.mergeServerState(data.state);
          }
        }
      } catch {
        // server unreachable, continue client mode
      }
    }, 3000);
  }

  private handleServerEvent(data: Record<string, unknown>) {
    const type = data.type as string;

    if (type === 'state_update' && data.state) {
      this.mergeServerState(data.state as Partial<AgentState>);
    } else if (type === 'log' && data.log) {
      const log = data.log as TerminalLog;
      this.state.terminalLogs = [log, ...this.state.terminalLogs].slice(0, 300);
      this.notify();
    } else if (type === 'decision' && data.analysis) {
      addLog(this.state, 'coordinator', '🧠 Claude Brain', 'analysis',
        data.analysis as string);
      this.notify();
    } else if (type === 'market_update') {
      addLog(this.state, 'system', '📊 Market Data', 'info',
        data.message as string || 'Market data refreshed');
      this.notify();
    }
  }

  private mergeServerState(serverState: Partial<AgentState>) {
    if (serverState.subAgents) {
      this.state.subAgents = serverState.subAgents as SubAgent[];
    }
    if (serverState.activeTrades) {
      this.state.activeTrades = serverState.activeTrades as Trade[];
    }
    if (serverState.terminalLogs) {
      // Merge logs, deduplicate by id
      const existingIds = new Set(this.state.terminalLogs.map(l => l.id));
      const newLogs = (serverState.terminalLogs as TerminalLog[]).filter(l => !existingIds.has(l.id));
      this.state.terminalLogs = [...newLogs, ...this.state.terminalLogs].slice(0, 300);
    }
    if (serverState.portfolioHistory) {
      this.state.portfolioHistory = serverState.portfolioHistory;
    }
    if (serverState.totalBalance !== undefined) {
      this.state.totalBalance = serverState.totalBalance;
      this.state.totalPnl = serverState.totalPnl || 0;
      this.state.totalPnlPercent = serverState.totalPnlPercent || 0;
    }
    if (serverState.coordinatorStatus) {
      this.state.coordinatorStatus = serverState.coordinatorStatus;
    }
    this.notify();
  }

  /**
   * Client-side mode: fetches real market data directly and uses heuristics
   * when the backend is not available
   */
  private async startClientMode() {
    // Fetch real market data on the client side
    const fetchAndLog = async () => {
      if (!this.state.isRunning) return;

      try {
        // Fetch real crypto prices
        const priceRes = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true'
        );
        if (priceRes.ok) {
          const prices = await priceRes.json();
          const btcPrice = prices.bitcoin?.usd || 0;
          const ethPrice = prices.ethereum?.usd || 0;
          const solPrice = prices.solana?.usd || 0;
          const btcChange = prices.bitcoin?.usd_24h_change?.toFixed(2) || '0';
          const ethChange = prices.ethereum?.usd_24h_change?.toFixed(2) || '0';
          const solChange = prices.solana?.usd_24h_change?.toFixed(2) || '0';

          addLog(this.state, 'system', '📊 Live Prices', 'info',
            `BTC: $${btcPrice.toLocaleString()} (${btcChange}%) | ETH: $${ethPrice.toLocaleString()} (${ethChange}%) | SOL: $${solPrice.toLocaleString()} (${solChange}%)`);

          // Heuristic-based decisions from real price data
          this.runHeuristicDecisions(prices);
        }
      } catch {
        addLog(this.state, 'system', '📊 Market Data', 'warning', 'Failed to fetch live prices');
      }

      this.notify();
    };

    // Initial fetch
    await fetchAndLog();

    // Poll every 30 seconds
    const interval = setInterval(fetchAndLog, 30000);
    this.pollInterval = interval;

    // Sub-agent activity simulation with real-ish data
    this.state.subAgents.forEach((agent, index) => {
      setTimeout(() => {
        const config = STRATEGY_CONFIG[agent.strategy];
        agent.status = 'analyzing';
        agent.currentTask = 'Connecting to live data feeds...';
        addLog(this.state, agent.id, `${config.icon} ${agent.name}`, 'info',
          `Sub-agent online. Allocated: $${agent.allocated.toFixed(2)} USDC. Fetching real data...`);
        this.notify();
      }, 500 + index * 600);
    });
  }

  private runHeuristicDecisions(prices: Record<string, { usd: number; usd_24h_change?: number }>) {
    const btcChange = prices.bitcoin?.usd_24h_change || 0;
    const ethChange = prices.ethereum?.usd_24h_change || 0;

    // Futures agent reacts to price changes
    const futuresAgent = this.state.subAgents.find(a => a.strategy === 'futures');
    if (futuresAgent) {
      const direction = btcChange > 1 ? 'bullish' : btcChange < -1 ? 'bearish' : 'neutral';
      const pnlChange = futuresAgent.allocated * (btcChange / 100) * 0.3 * STRATEGY_CONFIG.futures.riskLevel;
      applyTradeToAgent(
        this.state, futuresAgent,
        `Market ${direction}: BTC ${btcChange > 0 ? '+' : ''}${btcChange.toFixed(2)}% | ${direction === 'bullish' ? 'Holding longs' : direction === 'bearish' ? 'Tightening stops' : 'Monitoring'}`,
        pnlChange,
        'BTC/USDC',
        btcChange > 0 ? 'long' : 'short'
      );
    }

    // Arbitrage agent
    const arbAgent = this.state.subAgents.find(a => a.strategy === 'arbitrage');
    if (arbAgent) {
      const spread = Math.abs(btcChange - ethChange) * 0.1;
      const pnlChange = arbAgent.allocated * spread * 0.001;
      applyTradeToAgent(
        this.state, arbAgent,
        `Scanning BTC-ETH spread: ${spread.toFixed(3)}% | ${spread > 0.5 ? 'Opportunity found!' : 'Monitoring spreads'}`,
        pnlChange
      );
    }

    // DeFi yield agent
    const yieldAgent = this.state.subAgents.find(a => a.strategy === 'defi_yield');
    if (yieldAgent) {
      const dailyYield = yieldAgent.allocated * (0.082 / 365); // ~8.2% APY
      applyTradeToAgent(
        this.state, yieldAgent,
        `Yield accrued: +$${dailyYield.toFixed(4)} from Aave USDC position (8.2% APY)`,
        dailyYield
      );
    }

    // Funding rate agent
    const fundingAgent = this.state.subAgents.find(a => a.strategy === 'funding_rate');
    if (fundingAgent) {
      const fundingRevenue = fundingAgent.allocated * 0.0001 * (Math.random() + 0.5);
      applyTradeToAgent(
        this.state, fundingAgent,
        `Funding collected: +$${fundingRevenue.toFixed(4)} on delta-neutral BTC position`,
        fundingRevenue
      );
    }

    updatePortfolio(this.state);
    this.notify();
  }

  stop() {
    this.state.isRunning = false;
    this.state.coordinatorStatus = 'idle';

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Tell server to stop
    fetch('/api/agent/stop', { method: 'POST' }).catch(() => {});

    this.state.subAgents.forEach(a => {
      a.status = 'idle';
      a.currentTask = 'Stopped';
    });
    addLog(this.state, 'coordinator', '🧠 Coordinator', 'warning',
      'SurviveAgent system stopped. All sub-agents paused.');
    this.notify();
  }

  destroy() {
    this.stop();
    this.listeners.clear();
  }
}
