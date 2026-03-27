import { v4 as uuidv4 } from 'uuid';
import {
  AgentState,
  SubAgent,
  TerminalLog,
  Trade,
  PortfolioSnapshot,
  StrategyType,
  AgentStatus,
} from '@/types/agent';

const STRATEGY_CONFIG: Record<StrategyType, {
  name: string;
  description: string;
  icon: string;
  color: string;
  pairs: string[];
  actions: string[];
  riskLevel: number;
}> = {
  futures: {
    name: 'Futures Trader',
    description: 'Perpetual futures with leverage on major pairs',
    icon: '📈',
    color: '#3b82f6',
    pairs: ['BTC/USDC', 'ETH/USDC', 'SOL/USDC', 'ARB/USDC', 'AVAX/USDC'],
    actions: [
      'Analyzing BTC 4H chart - bullish divergence detected',
      'Opening 3x long ETH/USDC at support level',
      'Taking profit on SOL/USDC long +4.2%',
      'Setting stop-loss for BTC/USDC position',
      'Scanning funding rates across exchanges',
      'Detected bearish engulfing on ARB/USDC - opening short',
      'Closing ETH position before FOMC announcement',
      'RSI oversold on SOL - accumulating long position',
    ],
    riskLevel: 0.7,
  },
  polymarket: {
    name: 'Polymarket Oracle',
    description: 'Prediction markets & event-driven trading',
    icon: '🔮',
    color: '#a855f7',
    pairs: ['US Elections', 'Fed Rate', 'ETH ETF', 'BTC ATH', 'Crypto Regulation'],
    actions: [
      'Analyzing prediction market: "Will BTC hit $150k by Q2?"',
      'Buying YES shares on ETH ETF approval at $0.72',
      'Hedging election outcome positions',
      'Selling NO shares on Fed rate cut - probability shifted',
      'New market detected: "SOL flips BNB by market cap"',
      'Taking profit on resolved market +180%',
      'Analyzing social sentiment for upcoming vote',
      'Diversifying across 5 uncorrelated prediction markets',
    ],
    riskLevel: 0.5,
  },
  memecoin: {
    name: 'Memecoin Sniper',
    description: 'Early memecoin detection & momentum trading',
    icon: '🐸',
    color: '#fbbf24',
    pairs: ['PEPE/USDC', 'WIF/USDC', 'BONK/USDC', 'DOGE/USDC', 'SHIB/USDC'],
    actions: [
      'Scanning Pump.fun for new launches with high social score',
      'Detected whale accumulation in new token - analyzing',
      'Buying PEPE dip - social volume spike +340%',
      'Setting trailing stop on WIF position at +25%',
      'Analyzing token contract for honeypot indicators',
      'New Solana memecoin trending on Twitter - researching',
      'Taking quick profit on momentum trade +18%',
      'Filtering rug-pull indicators on new launches',
    ],
    riskLevel: 0.9,
  },
  airdrop: {
    name: 'Airdrop Farmer',
    description: 'Protocol interaction farming for airdrops',
    icon: '🪂',
    color: '#06b6d4',
    pairs: ['LayerZero', 'zkSync', 'Starknet', 'Scroll', 'Monad'],
    actions: [
      'Bridging assets to zkSync Era for activity score',
      'Executing swap on Starknet DEX - farming interactions',
      'Providing liquidity on Scroll testnet protocol',
      'Claiming LayerZero airdrop allocation - processing',
      'Interacting with new Monad testnet contracts',
      'Cross-chain bridging via Wormhole for farming',
      'Minting NFT on emerging L2 for eligibility',
      'Analyzing on-chain criteria for upcoming Scroll drop',
    ],
    riskLevel: 0.3,
  },
  arbitrage: {
    name: 'Arbitrage Scanner',
    description: 'Cross-DEX & cross-chain price arbitrage',
    icon: '⚡',
    color: '#00ff88',
    pairs: ['ETH Uni↔Sushi', 'USDC Arb↔Op', 'SOL Ray↔Orc', 'BTC CEX↔DEX'],
    actions: [
      'Price discrepancy detected: ETH $2.40 spread Uni↔Sushi',
      'Executing atomic arb: buy Uniswap, sell SushiSwap',
      'Cross-chain arb opportunity: USDC Arbitrum→Optimism',
      'Flash loan arbitrage executed - profit $12.50',
      'Monitoring 47 pairs across 8 DEXs for spreads',
      'MEV opportunity detected in mempool - executing',
      'Triangular arbitrage: ETH→USDC→WBTC→ETH +0.3%',
      'Gas cost analysis: arb profitable above $5 spread',
    ],
    riskLevel: 0.2,
  },
  defi_yield: {
    name: 'DeFi Yield Optimizer',
    description: 'Yield farming & liquidity provision optimization',
    icon: '🌾',
    color: '#22c55e',
    pairs: ['Aave ETH', 'Compound USDC', 'Curve 3Pool', 'Lido stETH', 'GMX GLP'],
    actions: [
      'Depositing USDC into Aave at 8.2% APY',
      'Rebalancing Curve 3Pool position for optimal yield',
      'Harvesting COMP rewards - compounding into position',
      'Migrating liquidity to higher-yield Lido vault',
      'Staking ETH via Lido - current APR 4.8%',
      'Auto-compounding GMX GLP rewards',
      'Analyzing impermanent loss on Uniswap V3 position',
      'New high-yield opportunity on Pendle: 12.4% APY',
    ],
    riskLevel: 0.3,
  },
  funding_rate: {
    name: 'Funding Rate Arb',
    description: 'Funding rate arbitrage between perp exchanges',
    icon: '💰',
    color: '#f97316',
    pairs: ['BTC Funding', 'ETH Funding', 'SOL Funding', 'DOGE Funding'],
    actions: [
      'BTC funding rate +0.03% on Binance, -0.01% on dYdX - arbing',
      'Collecting funding payment: +$8.20 on ETH short',
      'Adjusting hedge ratio for SOL funding position',
      'Funding rate spike detected on DOGE perps',
      'Opening delta-neutral position: long spot + short perp',
      'Closing low-yield funding position on ARB',
      'New 8h funding cycle - collecting +$14.50',
      'Scanning 20 perp markets for funding rate divergence',
    ],
    riskLevel: 0.25,
  },
};

const COORDINATOR_MESSAGES = [
  '🧠 Coordinator: Analyzing market conditions across all strategies...',
  '🧠 Coordinator: Reallocating capital - shifting 5% from yield to futures',
  '🧠 Coordinator: Risk assessment complete - all positions within limits',
  '🧠 Coordinator: Detected high volatility - reducing memecoin exposure',
  '🧠 Coordinator: New airdrop opportunity detected - deploying Airdrop Farmer',
  '🧠 Coordinator: Portfolio rebalance triggered - optimizing Sharpe ratio',
  '🧠 Coordinator: Market sentiment shifted bullish - increasing long bias',
  '🧠 Coordinator: Cross-strategy correlation check - reducing correlated risk',
  '🧠 Coordinator: Gas prices low - executing pending batch transactions',
  '🧠 Coordinator: Daily P&L review: all sub-agents performing within parameters',
  '🧠 Coordinator: Emergency check - all positions healthy, no liquidation risk',
  '🧠 Coordinator: Deploying idle capital to DeFi yield - 15% APY opportunity',
];

export class AgentEngine {
  private state: AgentState;
  private listeners: Set<(state: AgentState) => void> = new Set();
  private intervals: NodeJS.Timeout[] = [];

  constructor(initialBalance: number = 1000) {
    const subAgents = this.createSubAgents(initialBalance);
    this.state = {
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

  private createSubAgents(totalBalance: number): SubAgent[] {
    const allocations: Record<StrategyType, number> = {
      futures: 0.25,
      arbitrage: 0.20,
      defi_yield: 0.20,
      funding_rate: 0.15,
      polymarket: 0.08,
      memecoin: 0.05,
      airdrop: 0.07,
    };

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
        allocated: totalBalance * (allocations[strategy] || 0.1),
        lastAction: 'Initialized',
        lastActionTime: new Date(),
      })
    );
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

  private addLog(agentId: string, agentName: string, type: TerminalLog['type'], message: string, details?: string) {
    const log: TerminalLog = {
      id: uuidv4(),
      timestamp: new Date(),
      agentId,
      agentName,
      type,
      message,
      details,
    };
    this.state.terminalLogs = [log, ...this.state.terminalLogs].slice(0, 200);
  }

  private simulateAgentAction(agent: SubAgent) {
    const config = STRATEGY_CONFIG[agent.strategy];
    const action = config.actions[Math.floor(Math.random() * config.actions.length)];

    // Update agent status
    const statuses: AgentStatus[] = ['analyzing', 'executing', 'success'];
    agent.status = statuses[Math.floor(Math.random() * statuses.length)];
    agent.currentTask = action;
    agent.lastAction = action;
    agent.lastActionTime = new Date();

    // Simulate PnL change
    const riskFactor = config.riskLevel;
    const pnlChange = (Math.random() - 0.45) * agent.allocated * 0.02 * riskFactor;
    agent.pnl += pnlChange;
    agent.allocated += pnlChange;
    agent.pnlPercent = (agent.pnl / (agent.allocated - agent.pnl)) * 100;
    agent.trades += Math.random() > 0.6 ? 1 : 0;
    agent.winRate = agent.trades > 0
      ? Math.min(85, Math.max(35, 55 + (Math.random() - 0.5) * 20))
      : 0;

    // Log types based on action
    const logType: TerminalLog['type'] = pnlChange > 0 ? 'success' : pnlChange < -5 ? 'warning' : 'trade';
    this.addLog(agent.id, `${config.icon} ${agent.name}`, logType, action);

    // Simulate trades
    if (Math.random() > 0.7) {
      const pair = config.pairs[Math.floor(Math.random() * config.pairs.length)];
      const trade: Trade = {
        id: uuidv4(),
        agentId: agent.id,
        strategy: agent.strategy,
        pair,
        side: Math.random() > 0.5 ? 'long' : 'short',
        amount: agent.allocated * (Math.random() * 0.1 + 0.05),
        entryPrice: Math.random() * 50000 + 1000,
        currentPrice: 0,
        pnl: pnlChange,
        pnlPercent: (pnlChange / agent.allocated) * 100,
        status: Math.random() > 0.3 ? 'open' : 'closed',
        timestamp: new Date(),
      };
      trade.currentPrice = trade.entryPrice * (1 + (Math.random() - 0.48) * 0.05);

      if (trade.status === 'open') {
        this.state.activeTrades = [trade, ...this.state.activeTrades.filter(t => t.agentId !== agent.id || Math.random() > 0.3)].slice(0, 20);
      }
    }
  }

  private updatePortfolio() {
    const totalValue = this.state.subAgents.reduce((sum, a) => sum + a.allocated, 0);
    const totalPnl = totalValue - this.state.initialBalance;
    const totalPnlPercent = (totalPnl / this.state.initialBalance) * 100;

    this.state.totalBalance = totalValue;
    this.state.totalPnl = totalPnl;
    this.state.totalPnlPercent = totalPnlPercent;

    this.state.portfolioHistory.push({
      timestamp: new Date(),
      totalValue,
      pnl: totalPnl,
      pnlPercent: totalPnlPercent,
    });

    // Keep last 100 data points
    if (this.state.portfolioHistory.length > 100) {
      this.state.portfolioHistory = this.state.portfolioHistory.slice(-100);
    }
  }

  start() {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    this.state.coordinatorStatus = 'analyzing';

    this.addLog('coordinator', '🧠 Coordinator', 'info', 'SurviveAgent system initialized. Starting all sub-agents...');
    this.addLog('coordinator', '🧠 Coordinator', 'info', `Initial capital: $${this.state.initialBalance.toFixed(2)} USDC`);
    this.addLog('coordinator', '🧠 Coordinator', 'info', 'Deploying 7 specialized sub-agents across strategies...');

    // Coordinator messages every 8-15 seconds
    const coordInterval = setInterval(() => {
      if (!this.state.isRunning) return;
      const msg = COORDINATOR_MESSAGES[Math.floor(Math.random() * COORDINATOR_MESSAGES.length)];
      this.state.coordinatorStatus = 'analyzing';
      this.addLog('coordinator', '🧠 Coordinator', 'info', msg);
      this.updatePortfolio();
      this.notify();

      setTimeout(() => {
        this.state.coordinatorStatus = 'executing';
        this.notify();
      }, 2000);
    }, 8000 + Math.random() * 7000);
    this.intervals.push(coordInterval);

    // Each agent acts on different intervals
    this.state.subAgents.forEach((agent, index) => {
      const baseInterval = 3000 + index * 1500;
      const interval = setInterval(() => {
        if (!this.state.isRunning) return;
        this.simulateAgentAction(agent);
        this.updatePortfolio();
        this.notify();
      }, baseInterval + Math.random() * 3000);
      this.intervals.push(interval);

      // Initial action after staggered delay
      setTimeout(() => {
        const config = STRATEGY_CONFIG[agent.strategy];
        agent.status = 'analyzing';
        agent.currentTask = 'Initializing strategy parameters...';
        this.addLog(agent.id, `${config.icon} ${agent.name}`, 'info', `Sub-agent online. Allocated: $${agent.allocated.toFixed(2)} USDC`);
        this.notify();
      }, 500 + index * 800);
    });

    this.notify();
  }

  stop() {
    this.state.isRunning = false;
    this.state.coordinatorStatus = 'idle';
    this.intervals.forEach(clearInterval);
    this.intervals = [];
    this.state.subAgents.forEach(a => {
      a.status = 'idle';
      a.currentTask = 'Stopped';
    });
    this.addLog('coordinator', '🧠 Coordinator', 'warning', 'SurviveAgent system stopped. All sub-agents paused.');
    this.notify();
  }

  destroy() {
    this.stop();
    this.listeners.clear();
  }
}
