/**
 * Claude Code CLI Brain — The AI Decision Engine
 *
 * Uses `claude --print` subprocess to:
 * 1. Analyze market sentiment from news/Twitter
 * 2. Detect market regimes (trending, ranging, volatile)
 * 3. Evaluate prediction market opportunities
 * 4. Coordinate strategy weights based on conditions
 * 5. Risk assessment and portfolio optimization
 *
 * NOT using API — directly spawning Claude Code CLI
 */
import { spawn } from 'child_process';
import { TradeAction } from '../strategies/base';
import { PriceSnapshot } from '../collectors/price-collector';
import { NewsItem, SentimentData } from '../collectors/news-collector';
import { FundingSnapshot } from '../collectors/funding-collector';
import { PolymarketEvent } from '../collectors/polymarket-collector';

const CLAUDE_CMD = 'claude';

// ===== Core Claude CLI Interface =====

async function askClaude(prompt: string, timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_CMD, ['--print', '--output-format', 'text', prompt], {
      timeout: timeoutMs,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`Claude CLI exit ${code}: ${stderr.slice(0, 300)}`));
    });

    proc.on('error', (err) => reject(err));

    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Claude CLI timeout'));
    }, timeoutMs + 5000);
  });
}

export async function isClaudeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(CLAUDE_CMD, ['--version'], { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

// ===== Specialized Analysis Functions =====

export interface MarketRegime {
  regime: 'bull_trend' | 'bear_trend' | 'ranging' | 'high_volatility' | 'accumulation' | 'distribution';
  confidence: number;
  description: string;
  recommendedStrategies: string[];
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
}

export interface SentimentAnalysis {
  overall: 'very_bullish' | 'bullish' | 'neutral' | 'bearish' | 'very_bearish';
  score: number; // -100 to +100
  keyDrivers: string[];
  contrarian: boolean; // whether to go against sentiment
  narrative: string;
}

export interface StrategyWeights {
  momentum: number;
  funding_arb: number;
  yield: number;
  polymarket: number;
  reason: string;
}

export interface PolymarketAssessment {
  marketId: string;
  title: string;
  estimatedProbability: number;
  confidence: number;
  reasoning: string;
}

/**
 * Analyze market regime using Claude's reasoning
 */
export async function analyzeMarketRegime(
  prices: Map<string, PriceSnapshot>,
  sentiment: SentimentData,
): Promise<MarketRegime> {
  const priceContext = [...prices.entries()]
    .map(([, p]) => `${p.symbol}: $${p.price.toLocaleString()} (${p.change24h >= 0 ? '+' : ''}${p.change24h.toFixed(2)}%)`)
    .join('\n');

  const prompt = `You are a crypto market analyst. Determine the current market regime.

PRICES:
${priceContext}

FEAR & GREED INDEX: ${sentiment.fearGreedIndex} (${sentiment.fearGreedLabel})
TRENDING COINS: ${sentiment.trendingCoins.join(', ')}

Respond in VALID JSON ONLY:
{
  "regime": "bull_trend|bear_trend|ranging|high_volatility|accumulation|distribution",
  "confidence": 0-100,
  "description": "1 sentence description",
  "recommendedStrategies": ["momentum", "funding_arb", "yield", "polymarket"],
  "riskLevel": "conservative|moderate|aggressive"
}`;

  try {
    const response = await askClaude(prompt, 30_000);
    const json = JSON.parse(extractJson(response));
    return json as MarketRegime;
  } catch {
    return getDefaultRegime(prices);
  }
}

/**
 * Deep sentiment analysis of news/tweets using Claude
 */
export async function analyzeSentiment(
  newsItems: NewsItem[],
  prices: Map<string, PriceSnapshot>,
): Promise<SentimentAnalysis> {
  const newsContext = newsItems.slice(0, 8)
    .map((n, i) => `[${i + 1}] @${n.handle}: ${n.text.slice(0, 200)} (${n.likes} likes)`)
    .join('\n');

  const btcPrice = prices.get('BTC');
  const ethPrice = prices.get('ETH');

  const prompt = `You are a crypto sentiment analyst. Analyze these tweets/news for market sentiment.

NEWS FROM CRYPTO TWITTER:
${newsContext || 'No news available'}

CONTEXT: BTC: $${btcPrice?.price.toLocaleString() || '?'} (${btcPrice?.change24h?.toFixed(2) || '?'}%) | ETH: $${ethPrice?.price.toLocaleString() || '?'} (${ethPrice?.change24h?.toFixed(2) || '?'}%)

Respond in VALID JSON ONLY:
{
  "overall": "very_bullish|bullish|neutral|bearish|very_bearish",
  "score": -100 to +100,
  "keyDrivers": ["key factor 1", "key factor 2"],
  "contrarian": true/false (should we go against the crowd?),
  "narrative": "1-2 sentence market narrative"
}`;

  try {
    const response = await askClaude(prompt, 30_000);
    const json = JSON.parse(extractJson(response));
    return json as SentimentAnalysis;
  } catch {
    return { overall: 'neutral', score: 0, keyDrivers: ['Analysis unavailable'], contrarian: false, narrative: 'Unable to analyze sentiment.' };
  }
}

/**
 * Assess Polymarket prediction markets — Claude's strongest edge
 */
export async function assessPolymarkets(
  markets: PolymarketEvent[],
  newsItems: NewsItem[],
): Promise<PolymarketAssessment[]> {
  if (markets.length === 0) return [];

  const marketContext = markets.slice(0, 5).map(m =>
    `- "${m.title}": YES=${(m.outcomePrices[0] * 100).toFixed(0)}% NO=${((m.outcomePrices[1] || (1 - m.outcomePrices[0])) * 100).toFixed(0)}% (Vol: $${(m.volume24h / 1000).toFixed(1)}k/24h)`
  ).join('\n');

  const newsContext = newsItems.slice(0, 5)
    .map(n => `@${n.handle}: ${n.text.slice(0, 150)}`)
    .join('\n');

  const prompt = `You are a prediction market expert. Assess these Polymarket markets for mispricing.

MARKETS:
${marketContext}

RECENT NEWS (relevant context):
${newsContext || 'No recent news'}

For each market you have an opinion on, respond in VALID JSON array:
[
  {
    "title": "exact market title",
    "estimatedProbability": 0.0-1.0 (your honest estimate),
    "confidence": 0-100 (how confident you are),
    "reasoning": "brief reasoning"
  }
]

Only include markets where you have meaningful insight. Return [] if no edge found.`;

  try {
    const response = await askClaude(prompt, 45_000);
    const json = JSON.parse(extractJson(response, true));
    return (json as PolymarketAssessment[]).map((a, i) => ({
      ...a,
      marketId: markets[i]?.id || '',
    }));
  } catch {
    return [];
  }
}

/**
 * Get optimal strategy weights from Claude based on current conditions
 */
export async function getStrategyWeights(
  regime: MarketRegime,
  sentiment: SentimentAnalysis,
  currentPnl: number,
  drawdown: number,
): Promise<StrategyWeights> {
  const prompt = `You are a portfolio allocation expert. Given current conditions, set strategy weights (must sum to 100).

MARKET REGIME: ${regime.regime} (${regime.confidence}% confidence) - ${regime.description}
SENTIMENT: ${sentiment.overall} (score: ${sentiment.score}) - ${sentiment.narrative}
CURRENT P&L: ${currentPnl >= 0 ? '+' : ''}$${currentPnl.toFixed(2)}
DRAWDOWN: ${drawdown.toFixed(2)}%

Strategies:
- momentum: Leveraged directional trades on perps (high risk/reward)
- funding_arb: Delta-neutral funding rate collection (low risk, steady)
- yield: DeFi yield farming (low risk, steady)
- polymarket: Prediction market bets (medium risk, alpha from analysis)

Respond in VALID JSON:
{
  "momentum": 0-100,
  "funding_arb": 0-100,
  "yield": 0-100,
  "polymarket": 0-100,
  "reason": "brief allocation reasoning"
}`;

  try {
    const response = await askClaude(prompt, 20_000);
    const json = JSON.parse(extractJson(response));
    return json as StrategyWeights;
  } catch {
    // Default conservative weights
    return {
      momentum: 15,
      funding_arb: 30,
      yield: 40,
      polymarket: 15,
      reason: 'Default conservative allocation (Claude unavailable)',
    };
  }
}

/**
 * Full coordinator decision cycle
 */
export async function coordinatorCycle(context: {
  prices: Map<string, PriceSnapshot>;
  sentiment: SentimentData;
  newsItems: NewsItem[];
  fundingRates: Map<string, FundingSnapshot>;
  polymarkets: PolymarketEvent[];
  currentPnl: number;
  drawdown: number;
  pendingActions: TradeAction[];
}): Promise<{
  regime: MarketRegime;
  sentiment: SentimentAnalysis;
  weights: StrategyWeights;
  polymarketAssessments: PolymarketAssessment[];
  approvedActions: TradeAction[];
  rejectedActions: { action: TradeAction; reason: string }[];
}> {
  // Run analyses in parallel where possible
  const [regime, sentimentAnalysis] = await Promise.all([
    analyzeMarketRegime(context.prices, context.sentiment),
    analyzeSentiment(context.newsItems, context.prices),
  ]);

  // These depend on above results
  const [weights, polymarketAssessments] = await Promise.all([
    getStrategyWeights(regime, sentimentAnalysis, context.currentPnl, context.drawdown),
    assessPolymarkets(context.polymarkets, context.newsItems),
  ]);

  // Filter actions through risk + regime lens
  const approvedActions: TradeAction[] = [];
  const rejectedActions: { action: TradeAction; reason: string }[] = [];

  for (const action of context.pendingActions) {
    if (action.type === 'no_action') continue;

    // Reject high-risk momentum trades in bear regime
    if (action.strategyName === 'Momentum Trader' && regime.regime === 'bear_trend' && action.type === 'open_long') {
      rejectedActions.push({ action, reason: `Bear trend detected (${regime.confidence}% confidence). Long rejected.` });
      continue;
    }

    // Reject large positions in high volatility
    if (regime.regime === 'high_volatility' && action.amount > 100 && action.leverage && action.leverage > 2) {
      rejectedActions.push({ action, reason: 'High volatility regime. High leverage rejected.' });
      continue;
    }

    // Reject if confidence too low
    if (action.confidence < 40) {
      rejectedActions.push({ action, reason: `Confidence too low (${action.confidence}%)` });
      continue;
    }

    approvedActions.push(action);
  }

  return {
    regime,
    sentiment: sentimentAnalysis,
    weights,
    polymarketAssessments,
    approvedActions,
    rejectedActions,
  };
}

// ===== Helpers =====

function extractJson(text: string, isArray = false): string {
  const pattern = isArray ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = text.match(pattern);
  if (match) return match[0];
  return isArray ? '[]' : '{}';
}

function getDefaultRegime(prices: Map<string, PriceSnapshot>): MarketRegime {
  const btc = prices.get('BTC');
  const change = btc?.change24h || 0;

  if (change > 5) return { regime: 'bull_trend', confidence: 60, description: 'Strong upward momentum', recommendedStrategies: ['momentum', 'funding_arb'], riskLevel: 'moderate' };
  if (change < -5) return { regime: 'bear_trend', confidence: 60, description: 'Significant downward pressure', recommendedStrategies: ['funding_arb', 'yield'], riskLevel: 'conservative' };
  if (Math.abs(change) > 3) return { regime: 'high_volatility', confidence: 50, description: 'Elevated volatility', recommendedStrategies: ['funding_arb', 'yield'], riskLevel: 'conservative' };
  return { regime: 'ranging', confidence: 40, description: 'Sideways market', recommendedStrategies: ['yield', 'funding_arb', 'polymarket'], riskLevel: 'moderate' };
}
