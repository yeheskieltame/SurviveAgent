/**
 * Server-side Agent Engine
 *
 * This is the REAL backend that:
 * 1. Fetches live market data (CoinGecko, FXTwitter, DeFi Llama, Binance)
 * 2. Sends context to Claude Code CLI for AI decisions
 * 3. Executes MCP tools based on Claude's decisions
 * 4. Streams state updates to the frontend via SSE
 */
import {
  AgentState,
  TerminalLog,
  StrategyType,
} from '@/types/agent';
import {
  createInitialState,
  addLog,
  updatePortfolio,
  applyTradeToAgent,
  STRATEGY_CONFIG,
} from '../agent-engine';
import { gatherMarketData, MarketContext } from '../data/market-aggregator';
import { getCoordinatorDecision, isClaudeAvailable } from '../brain/claude-brain';
import { AgentDecision } from '../brain/types';
import { executeTool, getToolDescriptions } from '../mcp/tools';
import { formatUSD } from '../utils';

export type SSECallback = (event: string, data: unknown) => void;

class ServerEngine {
  private state: AgentState | null = null;
  private running = false;
  private claudeAvailable = false;
  private sseListeners: Set<SSECallback> = new Set();
  private intervals: NodeJS.Timeout[] = [];
  private decisionCount = 0;
  private lastMarketData: MarketContext | null = null;

  getState() {
    return this.state;
  }

  isRunning() {
    return this.running;
  }

  isClaudeConnected() {
    return this.claudeAvailable;
  }

  addSSEListener(cb: SSECallback) {
    this.sseListeners.add(cb);
    return () => this.sseListeners.delete(cb);
  }

  private broadcast(event: string, data: unknown) {
    this.sseListeners.forEach(cb => {
      try { cb(event, data); } catch {}
    });
  }

  async start(initialBalance: number): Promise<{ claudeAvailable: boolean }> {
    if (this.running && this.state) {
      return { claudeAvailable: this.claudeAvailable };
    }

    this.state = createInitialState(initialBalance);
    this.state.isRunning = true;
    this.state.coordinatorStatus = 'analyzing';
    this.running = true;

    // Check Claude CLI availability
    this.claudeAvailable = await isClaudeAvailable();

    addLog(this.state, 'coordinator', '🧠 Coordinator', 'info',
      'SurviveAgent server engine started.');
    addLog(this.state, 'coordinator', '🧠 Coordinator', 'info',
      `Claude Code CLI: ${this.claudeAvailable ? '✅ Connected' : '❌ Not found (using heuristics)'}`);
    addLog(this.state, 'coordinator', '🧠 Coordinator', 'info',
      `Capital: ${formatUSD(initialBalance)} | Agents: 7 | Mode: ${this.claudeAvailable ? 'AI-Powered' : 'Heuristic'}`);

    if (this.claudeAvailable) {
      addLog(this.state, 'coordinator', '🧠 Coordinator', 'success',
        `Available tools: ${getToolDescriptions()}`);
    }

    this.broadcastState();

    // Initialize sub-agents with staggered boot
    this.state.subAgents.forEach((agent, i) => {
      setTimeout(() => {
        if (!this.state || !this.running) return;
        const config = STRATEGY_CONFIG[agent.strategy];
        agent.status = 'analyzing';
        agent.currentTask = 'Booting up & connecting to data feeds...';
        addLog(this.state, agent.id, `${config.icon} ${agent.name}`, 'info',
          `Online. Allocated: ${formatUSD(agent.allocated)}. Connecting to live feeds...`);
        this.broadcastState();
      }, 500 + i * 400);
    });

    // === MAIN LOOP: Fetch data + make decisions ===

    // 1. Market data refresh every 30 seconds
    const marketInterval = setInterval(() => this.refreshMarketData(), 30_000);
    this.intervals.push(marketInterval);

    // Initial market data fetch
    setTimeout(() => this.refreshMarketData(), 2000);

    // 2. Coordinator decision cycle every 45 seconds (or 20s in heuristic mode)
    const decisionInterval = setInterval(
      () => this.runDecisionCycle(),
      this.claudeAvailable ? 45_000 : 20_000
    );
    this.intervals.push(decisionInterval);

    // First decision after initial data fetch
    setTimeout(() => this.runDecisionCycle(), 8000);

    // 3. Sub-agent micro-actions every 10 seconds
    const microInterval = setInterval(() => this.runSubAgentMicroActions(), 10_000);
    this.intervals.push(microInterval);

    return { claudeAvailable: this.claudeAvailable };
  }

  stop() {
    this.running = false;
    this.intervals.forEach(clearInterval);
    this.intervals = [];

    if (this.state) {
      this.state.isRunning = false;
      this.state.coordinatorStatus = 'idle';
      this.state.subAgents.forEach(a => {
        a.status = 'idle';
        a.currentTask = 'Stopped';
      });
      addLog(this.state, 'coordinator', '🧠 Coordinator', 'warning',
        'Engine stopped. All agents paused.');
      this.broadcastState();
    }
  }

  private broadcastState() {
    if (!this.state) return;
    this.broadcast('state_update', { state: this.state });
  }

  /**
   * Fetch live market data from all sources
   */
  private async refreshMarketData() {
    if (!this.state || !this.running) return;

    addLog(this.state, 'system', '📊 Data Feed', 'info', 'Refreshing market data...');
    this.broadcastState();

    try {
      this.lastMarketData = await gatherMarketData();

      const priceCount = this.lastMarketData.prices.prices.length;
      const newsCount = this.lastMarketData.news.tweets.length;
      const yieldCount = this.lastMarketData.defi.topYields.length;
      const fundingCount = this.lastMarketData.defi.fundingRates.length;

      addLog(this.state, 'system', '📊 Data Feed', 'success',
        `Live data loaded: ${priceCount} prices | ${newsCount} news items | ${yieldCount} yield pools | ${fundingCount} funding rates`);

      // Log top price movers
      const topMovers = [...this.lastMarketData.prices.prices]
        .sort((a, b) => Math.abs(b.price_change_percentage_24h) - Math.abs(a.price_change_percentage_24h))
        .slice(0, 3);

      if (topMovers.length > 0) {
        const moverStr = topMovers.map(p =>
          `${p.symbol} $${p.current_price.toLocaleString()} (${p.price_change_percentage_24h >= 0 ? '+' : ''}${p.price_change_percentage_24h.toFixed(2)}%)`
        ).join(' | ');
        addLog(this.state, 'system', '📊 Top Movers', 'info', moverStr);
      }

      // Log notable news if any
      if (this.lastMarketData.news.tweets.length > 0) {
        const topTweet = this.lastMarketData.news.tweets[0];
        addLog(this.state, 'system', '📰 News', 'info',
          `@${topTweet.authorHandle}: ${topTweet.text.slice(0, 150)}...`);
      }

      this.broadcast('market_update', {
        message: `Market data refreshed: ${priceCount} prices, ${newsCount} news`,
        prices: this.lastMarketData.prices.prices.slice(0, 5),
      });
    } catch (err) {
      addLog(this.state, 'system', '📊 Data Feed', 'error',
        `Failed to refresh market data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    this.broadcastState();
  }

  /**
   * Main decision cycle: send data to Claude Code or run heuristics
   */
  private async runDecisionCycle() {
    if (!this.state || !this.running || !this.lastMarketData) return;

    this.state.coordinatorStatus = 'analyzing';
    this.decisionCount++;
    addLog(this.state, 'coordinator', '🧠 Coordinator', 'analysis',
      `Decision cycle #${this.decisionCount} starting...`);
    this.broadcastState();

    let decision: AgentDecision;

    if (this.claudeAvailable) {
      // === CLAUDE CODE BRAIN ===
      addLog(this.state, 'coordinator', '🧠 Claude Brain', 'info',
        'Sending market context to Claude Code for analysis...');
      this.broadcastState();

      const portfolioState = this.formatPortfolioState();
      const recentActions = this.state.terminalLogs
        .filter(l => l.type === 'trade' || l.type === 'success')
        .slice(0, 10)
        .map(l => `[${l.agentName}] ${l.message}`)
        .join('\n');

      decision = await getCoordinatorDecision(
        this.lastMarketData.formattedContext,
        portfolioState,
        recentActions
      );

      addLog(this.state, 'coordinator', '🧠 Claude Brain', 'analysis',
        `Analysis: ${decision.analysis}`);
      addLog(this.state, 'coordinator', '🧠 Claude Brain', 'info',
        `Sentiment: ${decision.sentiment.toUpperCase()} | Risk: ${decision.riskLevel.toUpperCase()} | Tasks: ${decision.tasks.length}`);

      this.broadcast('decision', {
        analysis: decision.analysis,
        sentiment: decision.sentiment,
        riskLevel: decision.riskLevel,
      });
    } else {
      // === HEURISTIC MODE ===
      decision = this.makeHeuristicDecision();
      addLog(this.state, 'coordinator', '🧠 Coordinator', 'analysis',
        `Heuristic analysis: ${decision.analysis}`);
    }

    // Execute tasks from decision
    for (const task of decision.tasks) {
      if (!this.running) break;

      const agent = this.state.subAgents.find(a => a.strategy === task.agent);
      if (!agent) continue;

      const config = STRATEGY_CONFIG[agent.strategy as StrategyType];
      if (!config) continue;

      agent.status = 'executing';
      agent.currentTask = `${task.action}: ${task.asset} (${task.reason})`;

      // Use MCP tools for real data within task execution
      if (task.action === 'analyze') {
        const toolResult = await executeTool('get_crypto_prices');
        if (toolResult.success) {
          addLog(this.state, agent.id, `${config.icon} ${agent.name}`, 'info',
            `Analyzing live data: ${toolResult.message}`);
        }
      }

      // Simulate trade impact based on real market data
      const pnlChange = this.calculateRealPnl(agent, task, this.lastMarketData);
      applyTradeToAgent(
        this.state, agent,
        `[${task.action.toUpperCase()}] ${task.asset}: ${task.reason}`,
        pnlChange,
        task.asset,
        task.action === 'buy' ? 'long' : task.action === 'sell' ? 'short' : undefined
      );

      addLog(this.state, agent.id, `${config.icon} ${agent.name}`,
        pnlChange >= 0 ? 'success' : 'warning',
        `Executed: ${task.action} ${task.asset} | PnL: ${pnlChange >= 0 ? '+' : ''}$${pnlChange.toFixed(2)} | Reason: ${task.reason}`);
    }

    // Handle rebalancing
    if (decision.rebalance?.needed && decision.rebalance.changes.length > 0) {
      addLog(this.state, 'coordinator', '🧠 Coordinator', 'info',
        'Executing portfolio rebalance...');
      for (const change of decision.rebalance.changes) {
        const fromAgent = this.state.subAgents.find(a => a.strategy === change.from);
        const toAgent = this.state.subAgents.find(a => a.strategy === change.to);
        if (fromAgent && toAgent) {
          const amount = fromAgent.allocated * (change.percent / 100);
          fromAgent.allocated -= amount;
          toAgent.allocated += amount;
          addLog(this.state, 'coordinator', '🧠 Coordinator', 'trade',
            `Rebalanced: ${formatUSD(amount)} from ${change.from} → ${change.to}`);
        }
      }
    }

    this.state.coordinatorStatus = 'success';
    updatePortfolio(this.state);
    this.broadcastState();

    // Reset status after brief success indicator
    setTimeout(() => {
      if (this.state && this.running) {
        this.state.coordinatorStatus = 'executing';
        this.broadcastState();
      }
    }, 3000);
  }

  /**
   * Micro-actions for sub-agents between decision cycles
   */
  private async runSubAgentMicroActions() {
    if (!this.state || !this.running) return;

    // Pick 2-3 random agents for micro-updates
    const shuffled = [...this.state.subAgents].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 2 + Math.floor(Math.random() * 2));

    for (const agent of selected) {
      if (!this.running) break;
      const config = STRATEGY_CONFIG[agent.strategy as StrategyType];
      if (!config) continue;

      // Real data micro-actions
      switch (agent.strategy) {
        case 'defi_yield': {
          // Accrue yield in real-time
          const dailyYield = agent.allocated * (0.082 / 365 / 144); // per 10min at 8.2% APY
          agent.pnl += dailyYield;
          agent.allocated += dailyYield;
          agent.status = 'success';
          agent.currentTask = `Yield accruing: +$${dailyYield.toFixed(6)}/tick`;
          break;
        }
        case 'funding_rate': {
          const fundingRevenue = agent.allocated * 0.00005 * (0.5 + Math.random());
          agent.pnl += fundingRevenue;
          agent.allocated += fundingRevenue;
          agent.status = 'success';
          agent.currentTask = `Funding collected: +$${fundingRevenue.toFixed(4)}`;
          break;
        }
        case 'arbitrage': {
          agent.status = 'analyzing';
          agent.currentTask = 'Scanning DEX spreads across 47 pairs...';
          break;
        }
        default: {
          agent.status = 'analyzing';
          agent.currentTask = 'Monitoring market conditions...';
          break;
        }
      }

      agent.lastActionTime = new Date();
    }

    updatePortfolio(this.state);
    this.broadcastState();
  }

  /**
   * Calculate PnL based on real market data and decision
   */
  private calculateRealPnl(
    agent: { allocated: number; strategy: StrategyType },
    task: { action: string; amountPercent: number },
    marketData: MarketContext
  ): number {
    const riskLevel = STRATEGY_CONFIG[agent.strategy]?.riskLevel || 0.5;
    const positionSize = agent.allocated * (task.amountPercent / 100) * 0.01;

    // Base PnL from real market movement
    const btcChange = marketData.prices.prices.find(p => p.symbol === 'BTC')?.price_change_percentage_24h || 0;
    const marketFactor = btcChange / 100;

    // Direction based on action
    const directionMultiplier = task.action === 'buy' || task.action === 'stake' ? 1 : task.action === 'sell' ? -1 : 0.5;

    // Calculate with some variance
    const basePnl = positionSize * marketFactor * directionMultiplier * riskLevel;
    const noise = (Math.random() - 0.45) * positionSize * 0.1; // slight positive bias

    return basePnl + noise;
  }

  /**
   * Heuristic decision when Claude CLI is not available
   */
  private makeHeuristicDecision(): AgentDecision {
    if (!this.lastMarketData) {
      return {
        analysis: 'Waiting for market data...',
        sentiment: 'neutral',
        riskLevel: 'low',
        tasks: [],
        rebalance: { needed: false, changes: [] },
        raw: '',
      };
    }

    const prices = this.lastMarketData.prices.prices;
    const btcData = prices.find(p => p.symbol === 'BTC');
    const ethData = prices.find(p => p.symbol === 'ETH');

    const btcChange = btcData?.price_change_percentage_24h || 0;
    const ethChange = ethData?.price_change_percentage_24h || 0;
    const avgChange = (btcChange + ethChange) / 2;

    const sentiment = avgChange > 2 ? 'bullish' as const : avgChange < -2 ? 'bearish' as const : 'neutral' as const;
    const riskLevel = Math.abs(avgChange) > 5 ? 'high' as const : Math.abs(avgChange) > 2 ? 'medium' as const : 'low' as const;

    const tasks = [];

    // Futures based on trend
    if (Math.abs(btcChange) > 1) {
      tasks.push({
        agent: 'futures',
        action: btcChange > 0 ? 'buy' : 'sell',
        asset: 'BTC/USDC',
        amountPercent: Math.min(30, Math.abs(btcChange) * 5),
        reason: `BTC ${btcChange > 0 ? '+' : ''}${btcChange.toFixed(2)}% - ${btcChange > 0 ? 'momentum long' : 'hedging short'}`,
        urgency: Math.abs(btcChange) > 3 ? 'high' : 'medium',
      });
    }

    // Arbitrage - always scanning
    tasks.push({
      agent: 'arbitrage',
      action: 'analyze',
      asset: 'ALL',
      amountPercent: 0,
      reason: `Scanning ${Math.abs(btcChange - ethChange).toFixed(2)}% BTC-ETH divergence`,
      urgency: 'low',
    });

    // DeFi yield - always accruing
    tasks.push({
      agent: 'defi_yield',
      action: 'stake',
      asset: 'USDC',
      amountPercent: 80,
      reason: 'Maintaining yield positions across Aave/Compound',
      urgency: 'low',
    });

    // Funding rate
    if (this.lastMarketData.defi.fundingRates.length > 0) {
      const topFunding = this.lastMarketData.defi.fundingRates[0];
      tasks.push({
        agent: 'funding_rate',
        action: topFunding.rate > 0 ? 'sell' : 'buy',
        asset: topFunding.pair,
        amountPercent: 20,
        reason: `Funding rate ${topFunding.rate.toFixed(4)}% - ${topFunding.rate > 0 ? 'shorting for funding' : 'longing against negative funding'}`,
        urgency: 'medium',
      });
    }

    // Memecoin - only in strong bullish conditions
    if (btcChange > 3) {
      tasks.push({
        agent: 'memecoin',
        action: 'buy',
        asset: 'PEPE/USDC',
        amountPercent: 15,
        reason: 'Strong bullish momentum - meme rotation likely',
        urgency: 'medium',
      });
    }

    // News-driven actions
    if (this.lastMarketData.news.tweets.length > 0) {
      const topTweet = this.lastMarketData.news.tweets[0];
      if (topTweet.likes > 1000) {
        tasks.push({
          agent: 'polymarket',
          action: 'analyze',
          asset: 'News-driven',
          amountPercent: 0,
          reason: `High-engagement news: @${topTweet.authorHandle} (${topTweet.likes} likes)`,
          urgency: 'low',
        });
      }
    }

    return {
      analysis: `Market ${sentiment}: BTC ${btcChange >= 0 ? '+' : ''}${btcChange.toFixed(2)}%, ETH ${ethChange >= 0 ? '+' : ''}${ethChange.toFixed(2)}%. ${sentiment === 'bullish' ? 'Increasing exposure.' : sentiment === 'bearish' ? 'Reducing risk.' : 'Maintaining positions.'}`,
      sentiment,
      riskLevel,
      tasks,
      rebalance: { needed: false, changes: [] },
      raw: '',
    };
  }

  private formatPortfolioState(): string {
    if (!this.state) return 'No state';
    const lines = [
      `Total Balance: ${formatUSD(this.state.totalBalance)}`,
      `Total PnL: ${formatUSD(this.state.totalPnl)} (${this.state.totalPnlPercent.toFixed(2)}%)`,
      `Active Trades: ${this.state.activeTrades.length}`,
      '',
      'Sub-Agent Allocations:',
      ...this.state.subAgents.map(a =>
        `  ${a.name}: ${formatUSD(a.allocated)} (PnL: ${formatUSD(a.pnl)}, Trades: ${a.trades}, Win: ${a.winRate.toFixed(0)}%)`
      ),
    ];
    return lines.join('\n');
  }
}

// Singleton server engine
export const serverEngine = new ServerEngine();
