/**
 * SurviveAgent Server Engine v2
 *
 * Artemis-pattern architecture:
 * COLLECTORS (real-time data) → STRATEGIES (signal generation) → EXECUTORS (trade execution)
 *
 * With Claude Code CLI as the AI coordinator brain
 */
import { v4 as uuidv4 } from 'uuid';
import { AgentState, TerminalLog, StrategyType, AgentStatus } from '@/types/agent';
import { addLog, updatePortfolio, STRATEGY_CONFIG } from '../agent-engine';
import { formatUSD } from '../utils';

// Collectors
import { PriceCollector, PriceSnapshot } from '../collectors/price-collector';
import { FundingCollector } from '../collectors/funding-collector';
import { NewsCollector } from '../collectors/news-collector';
import { YieldCollector } from '../collectors/yield-collector';
import { PolymarketCollector } from '../collectors/polymarket-collector';

// Strategies
import { TradeAction } from '../strategies/base';
import { FundingArbStrategy } from '../strategies/funding-arb';
import { MomentumStrategy } from '../strategies/momentum';
import { YieldOptimizerStrategy } from '../strategies/yield-optimizer';
import { PolymarketStrategy } from '../strategies/polymarket-trader';

// Executor
import { PaperExecutor } from '../executors/paper-executor';

// Risk
import { RiskManager } from '../risk/manager';

// Brain
import {
  isClaudeAvailable,
  coordinatorCycle,
  MarketRegime,
  SentimentAnalysis,
} from '../brain/claude-brain';

export type SSECallback = (event: string, data: unknown) => void;

// ===== Sub-agent mapping to strategies =====
const STRATEGY_MAP: Record<string, StrategyType> = {
  'Momentum Trader': 'futures',
  'Funding Rate Arbitrage': 'funding_rate',
  'DeFi Yield Optimizer': 'defi_yield',
  'Polymarket Oracle': 'polymarket',
};

class ServerEngineV2 {
  private state: AgentState | null = null;
  private running = false;
  private claudeAvailable = false;
  private sseListeners: Set<SSECallback> = new Set();
  private intervals: NodeJS.Timeout[] = [];

  // Collectors
  private priceCollector = new PriceCollector();
  private fundingCollector = new FundingCollector();
  private newsCollector = new NewsCollector();
  private yieldCollector = new YieldCollector();
  private polymarketCollector = new PolymarketCollector();

  // Strategies
  private momentumStrategy = new MomentumStrategy();
  private fundingArbStrategy = new FundingArbStrategy();
  private yieldStrategy = new YieldOptimizerStrategy();
  private polymarketStrategy = new PolymarketStrategy();

  // Executor
  private executor: PaperExecutor | null = null;

  // Risk
  private riskManager: RiskManager | null = null;

  // Brain state
  private currentRegime: MarketRegime | null = null;
  private currentSentiment: SentimentAnalysis | null = null;
  private decisionCount = 0;
  private pendingActions: TradeAction[] = [];

  getState() { return this.state; }
  isRunning() { return this.running; }
  isClaudeConnected() { return this.claudeAvailable; }

  addSSEListener(cb: SSECallback) {
    this.sseListeners.add(cb);
    return () => this.sseListeners.delete(cb);
  }

  private broadcast(event: string, data: unknown) {
    this.sseListeners.forEach(cb => { try { cb(event, data); } catch {} });
  }

  private broadcastState() {
    if (!this.state) return;
    this.broadcast('state_update', { state: this.state });
  }

  private log(agentId: string, agentName: string, type: TerminalLog['type'], message: string) {
    if (!this.state) return;
    addLog(this.state, agentId, agentName, type, message);
    this.broadcastState();
  }

  async start(initialBalance: number): Promise<{ claudeAvailable: boolean }> {
    if (this.running && this.state) return { claudeAvailable: this.claudeAvailable };

    // Initialize state
    const { createInitialState } = await import('../agent-engine');
    this.state = createInitialState(initialBalance);
    this.state.isRunning = true;
    this.state.coordinatorStatus = 'analyzing';
    this.running = true;

    // Initialize subsystems
    this.executor = new PaperExecutor(initialBalance);
    this.riskManager = new RiskManager(initialBalance);

    // Set strategy allocations
    this.momentumStrategy.state.allocation = 25;
    this.fundingArbStrategy.state.allocation = 25;
    this.yieldStrategy.state.allocation = 35;
    this.polymarketStrategy.state.allocation = 15;

    // Check Claude
    this.claudeAvailable = await isClaudeAvailable();

    this.log('coordinator', '🧠 Coordinator', 'info', '╔══════════════════════════════════════════════╗');
    this.log('coordinator', '🧠 Coordinator', 'info', '║   SurviveAgent v2 — Artemis Architecture     ║');
    this.log('coordinator', '🧠 Coordinator', 'info', '╚══════════════════════════════════════════════╝');
    this.log('coordinator', '🧠 Coordinator', 'info', `Capital: ${formatUSD(initialBalance)} USDC`);
    this.log('coordinator', '🧠 Coordinator', this.claudeAvailable ? 'success' : 'warning',
      `Claude Code CLI: ${this.claudeAvailable ? '✅ CONNECTED — AI decisions active' : '⚠️ Not found — using heuristic mode'}`);
    this.log('coordinator', '🧠 Coordinator', 'info', 'Pipeline: Collectors → Strategies → Risk Manager → Executor');

    // ===== WIRE UP THE PIPELINE =====

    // 1. Collectors emit events → Strategies process them
    this.wireCollectorsToStrategies();

    // 2. Start all collectors
    this.log('coordinator', '📡 Collectors', 'info', 'Starting 5 data collectors...');
    await this.startCollectors();

    // 3. Start coordinator decision cycle
    this.startCoordinatorCycle();

    // 4. Start position update cycle
    this.startPositionUpdater();

    // Boot sub-agents in UI
    this.bootSubAgents();

    return { claudeAvailable: this.claudeAvailable };
  }

  private wireCollectorsToStrategies() {
    // Price events → Momentum Strategy
    this.priceCollector.onEvent((event) => {
      if (!this.state || !this.running) return;
      const portfolioValue = this.executor?.getEquity() || this.state.initialBalance;
      const actions = this.momentumStrategy.processEvent(event, portfolioValue);
      this.pendingActions.push(...actions);

      // Also feed to funding arb
      if (event.type === 'price_update') {
        this.updateSubAgentFromPrice(event.data);
      }
    });

    // Funding events → Funding Arb Strategy
    this.fundingCollector.onEvent((event) => {
      if (!this.state || !this.running) return;
      const portfolioValue = this.executor?.getEquity() || this.state.initialBalance;
      const actions = this.fundingArbStrategy.processEvent(event, portfolioValue);
      this.pendingActions.push(...actions);

      if (event.data.rates) {
        const rates = event.data.rates as Record<string, { rate: number; symbol: string }>;
        const topRates = Object.values(rates)
          .sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))
          .slice(0, 3);
        if (topRates.length > 0) {
          this.log('funding', '💰 Funding Collector', 'info',
            `Top rates: ${topRates.map(r => `${r.symbol} ${r.rate > 0 ? '+' : ''}${r.rate.toFixed(4)}%`).join(' | ')}`);
        }
      }
    });

    // News events → logged for Claude analysis
    this.newsCollector.onEvent((event) => {
      if (!this.state) return;
      if (event.type === 'news_signal' && event.data.topItem) {
        const item = event.data.topItem as { handle: string; text: string; likes: number };
        this.log('news', '📰 News Signal', event.priority === 'high' ? 'warning' : 'info',
          `@${item.handle}: ${(item.text as string).slice(0, 120)}... (${item.likes} ❤️)`);
      }
      if (event.type === 'sentiment_shift') {
        const s = event.data.sentiment as Record<string, unknown>;
        this.log('sentiment', '🧭 Sentiment', 'analysis',
          `Fear & Greed: ${event.data.fearGreed} | Trending: ${(event.data.trending as string[])?.slice(0, 4).join(', ') || 'none'}`);

        // Feed to momentum strategy
        const portfolioValue = this.executor?.getEquity() || this.state.initialBalance;
        this.momentumStrategy.processEvent(event, portfolioValue);
      }
    });

    // Yield events → Yield Strategy
    this.yieldCollector.onEvent((event) => {
      if (!this.state || !this.running) return;
      const portfolioValue = this.executor?.getEquity() || this.state.initialBalance;
      const actions = this.yieldStrategy.processEvent(event, portfolioValue);
      this.pendingActions.push(...actions);

      if (event.data.bestStableAPY) {
        this.log('yield', '🌾 Yield Scan', 'info',
          `Best stable yield: ${(event.data.bestStableAPY as number).toFixed(2)}% APY | Best overall: ${(event.data.bestOverallAPY as number).toFixed(2)}% APY | Pools: ${event.data.totalPools}`);
      }
    });

    // Polymarket events → Polymarket Strategy
    this.polymarketCollector.onEvent((event) => {
      if (!this.state || !this.running) return;
      const portfolioValue = this.executor?.getEquity() || this.state.initialBalance;
      const actions = this.polymarketStrategy.processEvent(event, portfolioValue);
      this.pendingActions.push(...actions);

      if (event.data.totalMarkets) {
        const crypto = event.data.cryptoMarkets as Array<{ title: string }>;
        this.log('polymarket', '🔮 Polymarket', 'info',
          `${event.data.totalMarkets} markets | $${((event.data.totalVolume24h as number) / 1000).toFixed(0)}k vol/24h | Crypto: ${crypto?.length || 0} markets`);
      }
    });
  }

  private async startCollectors() {
    const collectors = [
      { collector: this.priceCollector, name: '📈 Prices (Binance WS + CoinGecko)' },
      { collector: this.fundingCollector, name: '💰 Funding Rates (Binance + Hyperliquid)' },
      { collector: this.newsCollector, name: '📰 News (FXTwitter + Fear&Greed)' },
      { collector: this.yieldCollector, name: '🌾 DeFi Yields (DeFi Llama)' },
      { collector: this.polymarketCollector, name: '🔮 Polymarket (Gamma API)' },
    ];

    for (const { collector, name } of collectors) {
      try {
        await collector.start();
        this.log('collector', '📡 Collector', 'success', `Started: ${name}`);
      } catch (err) {
        this.log('collector', '📡 Collector', 'error', `Failed: ${name} — ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
  }

  private startCoordinatorCycle() {
    const cycleDuration = this.claudeAvailable ? 60_000 : 30_000;

    // First cycle after 10 seconds (let collectors gather data)
    setTimeout(() => this.runCoordinatorCycle(), 10_000);

    const interval = setInterval(() => {
      if (this.running) this.runCoordinatorCycle();
    }, cycleDuration);
    this.intervals.push(interval);
  }

  private async runCoordinatorCycle() {
    if (!this.state || !this.running) return;

    this.decisionCount++;
    this.state.coordinatorStatus = 'analyzing';
    this.log('coordinator', '🧠 Coordinator', 'analysis',
      `━━━ Decision Cycle #${this.decisionCount} ━━━`);
    this.broadcastState();

    const prices = this.priceCollector.getPrices();
    const sentiment = this.newsCollector.getSentiment();
    const polymarkets = this.polymarketCollector.getCryptoMarkets();
    const currentPnl = this.executor?.getTotalPnL() || 0;
    const drawdown = this.riskManager?.getCurrentDrawdown() || 0;

    if (this.claudeAvailable) {
      // === FULL AI DECISION CYCLE ===
      this.log('coordinator', '🧠 Claude Brain', 'info', 'Analyzing market regime + sentiment...');

      try {
        const result = await coordinatorCycle({
          prices,
          sentiment,
          newsItems: sentiment.newsItems,
          fundingRates: this.fundingCollector.getRates(),
          polymarkets,
          currentPnl,
          drawdown,
          pendingActions: this.pendingActions,
        });

        this.currentRegime = result.regime;
        this.currentSentiment = result.sentiment;

        this.log('coordinator', '🧠 Claude Brain', 'analysis',
          `Regime: ${result.regime.regime.toUpperCase()} (${result.regime.confidence}%) — ${result.regime.description}`);
        this.log('coordinator', '🧠 Claude Brain', 'analysis',
          `Sentiment: ${result.sentiment.overall} (score: ${result.sentiment.score}) — ${result.sentiment.narrative}`);
        this.log('coordinator', '🧠 Claude Brain', 'info',
          `Weights: Momentum ${result.weights.momentum}% | Funding ${result.weights.funding_arb}% | Yield ${result.weights.yield}% | Polymarket ${result.weights.polymarket}%`);

        // Update strategy allocations
        this.momentumStrategy.state.allocation = result.weights.momentum;
        this.fundingArbStrategy.state.allocation = result.weights.funding_arb;
        this.yieldStrategy.state.allocation = result.weights.yield;
        this.polymarketStrategy.state.allocation = result.weights.polymarket;

        // Feed Polymarket assessments
        for (const assessment of result.polymarketAssessments) {
          this.polymarketStrategy.setClaudeAnalysis(
            assessment.marketId,
            assessment.estimatedProbability,
            assessment.confidence
          );
          this.log('coordinator', '🔮 Polymarket AI', 'analysis',
            `"${assessment.title}" — Estimate: ${(assessment.estimatedProbability * 100).toFixed(0)}% (${assessment.confidence}% confidence)`);
        }

        // Execute approved actions
        await this.executeActions(result.approvedActions);

        // Log rejections
        for (const { action, reason } of result.rejectedActions) {
          this.log('coordinator', '🛡️ Risk Filter', 'warning',
            `REJECTED [${action.strategyName}] ${action.asset}: ${reason}`);
        }

        this.broadcast('decision', {
          regime: result.regime,
          sentiment: result.sentiment,
          weights: result.weights,
          approved: result.approvedActions.length,
          rejected: result.rejectedActions.length,
        });
      } catch (err) {
        this.log('coordinator', '🧠 Claude Brain', 'error',
          `Analysis failed: ${err instanceof Error ? err.message : 'Unknown'}. Falling back to heuristics.`);
        await this.executeActionsHeuristic();
      }
    } else {
      // === HEURISTIC MODE ===
      await this.executeActionsHeuristic();
    }

    // Clear pending actions
    this.pendingActions = [];

    // Update portfolio
    this.state.coordinatorStatus = 'success';
    updatePortfolio(this.state);
    this.broadcastState();

    // Update sub-agent states from strategies
    this.syncSubAgentStates();

    setTimeout(() => {
      if (this.state && this.running) {
        this.state.coordinatorStatus = 'executing';
        this.broadcastState();
      }
    }, 3000);
  }

  private async executeActions(actions: TradeAction[]) {
    if (!this.state || !this.executor || !this.riskManager) return;

    for (const action of actions) {
      if (!this.running) break;

      // Risk check
      const riskCheck = this.riskManager.canTrade({
        currentExposure: this.executor.getTotalExposure(),
        newPositionSize: action.amount,
      });

      if (!riskCheck.allowed) {
        this.log('risk', '🛡️ Risk Manager', 'warning', `Blocked: ${riskCheck.reason}`);
        continue;
      }

      // Execute
      const result = await this.executor.execute(action);

      const strategyType = STRATEGY_MAP[action.strategyName] || 'arbitrage';
      const config = STRATEGY_CONFIG[strategyType];
      const icon = config?.icon || '⚡';

      if (result.success) {
        this.log(action.strategyName, `${icon} ${action.strategyName}`, 'success',
          `✅ ${action.type.toUpperCase()} ${action.asset} | ${formatUSD(action.amount)} | ${action.reasoning.slice(0, 100)}`);

        if (result.txHash) {
          this.log(action.strategyName, `${icon} Executor`, 'trade',
            `TX: ${result.txHash} | Price: $${result.executedPrice?.toFixed(2) || '?'} | Fee: $${result.fee?.toFixed(4) || '0'}`);
        }
      } else {
        this.log(action.strategyName, `${icon} ${action.strategyName}`, 'error',
          `❌ Failed: ${result.error}`);
      }
    }
  }

  private async executeActionsHeuristic() {
    if (!this.state) return;

    // In heuristic mode, execute all pending actions that pass basic risk checks
    const actions = this.pendingActions.filter(a => a.confidence >= 50 && a.type !== 'no_action');

    if (actions.length > 0) {
      this.log('coordinator', '🧠 Coordinator', 'info',
        `Heuristic mode: ${actions.length} signals above 50% confidence`);
      await this.executeActions(actions);
    } else {
      this.log('coordinator', '🧠 Coordinator', 'info',
        `No high-confidence signals this cycle. Pending: ${this.pendingActions.length}`);
    }

    // Log strategy statuses
    this.log('momentum', '📈 Momentum', 'info', this.momentumStrategy.getStatus());
    this.log('funding', '💰 Funding Arb', 'info', this.fundingArbStrategy.getStatus());
    this.log('yield', '🌾 Yield', 'info', this.yieldStrategy.getStatus());
    this.log('polymarket', '🔮 Polymarket', 'info', this.polymarketStrategy.getStatus());
  }

  private startPositionUpdater() {
    const interval = setInterval(() => {
      if (!this.running || !this.executor || !this.riskManager || !this.state) return;

      // Update positions with latest prices
      const priceMap = new Map<string, number>();
      for (const [, snapshot] of this.priceCollector.getPrices()) {
        priceMap.set(snapshot.symbol, snapshot.price);
      }
      this.executor.updatePositions(priceMap);

      // Update risk manager
      this.riskManager.updatePortfolio(this.executor.getEquity());

      // Update state
      this.state.totalBalance = this.executor.getEquity();
      this.state.totalPnl = this.executor.getEquity() - this.state.initialBalance;
      this.state.totalPnlPercent = (this.state.totalPnl / this.state.initialBalance) * 100;

      // Update active trades from executor positions
      this.state.activeTrades = this.executor.getPositions().map(p => ({
        id: p.id,
        agentId: p.strategy,
        strategy: (STRATEGY_MAP[p.strategy] || 'arbitrage') as StrategyType,
        pair: p.asset,
        side: p.side as 'long' | 'short',
        amount: p.amount,
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        pnl: p.pnl,
        pnlPercent: p.pnlPercent,
        status: 'open' as const,
        timestamp: p.openTime,
      }));

      // Update portfolio history
      this.state.portfolioHistory.push({
        timestamp: new Date(),
        totalValue: this.executor.getEquity(),
        pnl: this.state.totalPnl,
        pnlPercent: this.state.totalPnlPercent,
      });
      if (this.state.portfolioHistory.length > 300) {
        this.state.portfolioHistory = this.state.portfolioHistory.slice(-300);
      }

      this.broadcastState();
    }, 5_000); // every 5 seconds

    this.intervals.push(interval);
  }

  private updateSubAgentFromPrice(data: Record<string, unknown>) {
    if (!this.state) return;
    const allPrices = data.allPrices as Record<string, PriceSnapshot>;
    if (!allPrices) return;

    const btc = allPrices['BTC'];
    const eth = allPrices['ETH'];
    if (btc) {
      this.log('prices', '📊 Live Prices', 'info',
        `BTC $${btc.price.toLocaleString()} (${btc.change24h >= 0 ? '+' : ''}${btc.change24h.toFixed(2)}%) | ETH $${eth?.price.toLocaleString() || '?'} (${eth?.change24h?.toFixed(2) || '?'}%)`);
    }
  }

  private syncSubAgentStates() {
    if (!this.state || !this.executor) return;

    const positions = this.executor.getPositions();
    const strategies = [
      { strategy: this.momentumStrategy, type: 'futures' as StrategyType },
      { strategy: this.fundingArbStrategy, type: 'funding_rate' as StrategyType },
      { strategy: this.yieldStrategy, type: 'defi_yield' as StrategyType },
      { strategy: this.polymarketStrategy, type: 'polymarket' as StrategyType },
    ];

    for (const { strategy, type } of strategies) {
      const agent = this.state.subAgents.find(a => a.strategy === type);
      if (!agent) continue;

      const agentPositions = positions.filter(p => p.strategy === strategy.name);
      const pnl = agentPositions.reduce((s, p) => s + p.pnl, 0);

      agent.status = (strategy.state.allocation > 0 ? 'executing' : 'idle') as AgentStatus;
      agent.currentTask = strategy.getStatus();
      agent.pnl = pnl;
      agent.pnlPercent = agent.allocated > 0 ? (pnl / agent.allocated) * 100 : 0;
      agent.allocated = this.state.initialBalance * (strategy.state.allocation / 100);
      agent.trades = agentPositions.length;
    }

    // Update remaining agents (arbitrage, memecoin, airdrop) with general status
    for (const agent of this.state.subAgents) {
      if (!['futures', 'funding_rate', 'defi_yield', 'polymarket'].includes(agent.strategy)) {
        agent.status = 'analyzing';
        agent.currentTask = agent.strategy === 'arbitrage'
          ? 'Scanning cross-DEX spreads...'
          : agent.strategy === 'memecoin'
          ? 'Monitoring Pump.fun launches...'
          : 'Farming protocol interactions...';
      }
    }
  }

  private bootSubAgents() {
    if (!this.state) return;
    this.state.subAgents.forEach((agent, i) => {
      setTimeout(() => {
        if (!this.state || !this.running) return;
        const config = STRATEGY_CONFIG[agent.strategy];
        agent.status = 'analyzing';
        agent.currentTask = 'Connecting to live data feeds...';
        this.log(agent.id, `${config.icon} ${agent.name}`, 'info',
          `Online | Allocated: ${formatUSD(agent.allocated)} | Strategy: ${agent.description}`);
        this.broadcastState();
      }, 500 + i * 300);
    });
  }

  stop() {
    this.running = false;
    this.intervals.forEach(clearInterval);
    this.intervals = [];

    // Stop all collectors
    this.priceCollector.stop();
    this.fundingCollector.stop();
    this.newsCollector.stop();
    this.yieldCollector.stop();
    this.polymarketCollector.stop();

    if (this.state) {
      this.state.isRunning = false;
      this.state.coordinatorStatus = 'idle';
      this.state.subAgents.forEach(a => { a.status = 'idle'; a.currentTask = 'Stopped'; });
      this.log('coordinator', '🧠 Coordinator', 'warning', 'Engine stopped. All collectors and strategies paused.');
      this.broadcastState();
    }

    this.pendingActions = [];
  }
}

export const serverEngine = new ServerEngineV2();
