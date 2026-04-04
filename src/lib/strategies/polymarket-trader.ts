/**
 * Polymarket Prediction Market Strategy
 * Uses AI sentiment analysis to find mispriced prediction markets
 * Key edge: Claude can analyze news context better than most market participants
 */
import { v4 as uuidv4 } from 'uuid';
import { MarketEvent } from '../collectors/base';
import { BaseStrategy, TradeAction } from './base';
import { PolymarketEvent } from '../collectors/polymarket-collector';

const MIN_VOLUME_24H = 5000;    // minimum $5k daily volume
const MIN_LIQUIDITY = 10000;    // minimum $10k liquidity
const EDGE_THRESHOLD = 0.10;    // need 10% perceived edge to trade
const MAX_BET_SIZE = 0.03;      // max 3% of portfolio per bet

export class PolymarketStrategy extends BaseStrategy {
  name = 'Polymarket Oracle';
  platform = 'polymarket' as const;

  private activeBets: Map<string, { marketId: string; side: string; price: number }> = new Map();
  private claudeAnalysis: Map<string, { probability: number; confidence: number }> = new Map();

  // Claude will set these via the brain
  setClaudeAnalysis(marketId: string, probability: number, confidence: number) {
    this.claudeAnalysis.set(marketId, { probability, confidence });
  }

  processEvent(event: MarketEvent, portfolioValue: number): TradeAction[] {
    if (event.type !== 'polymarket_update') return [];

    const actions: TradeAction[] = [];
    const allocation = portfolioValue * (this.state.allocation / 100);
    const maxBet = portfolioValue * MAX_BET_SIZE;

    // Process crypto-related markets first (higher edge from AI)
    const cryptoMarkets = (event.data.cryptoMarkets || []) as PolymarketEvent[];
    const mispricedCandidates = (event.data.mispricedCandidates || []) as PolymarketEvent[];

    const allCandidates = [...cryptoMarkets, ...mispricedCandidates]
      .filter(m => m.volume24h > MIN_VOLUME_24H && m.liquidity > MIN_LIQUIDITY)
      .filter(m => !this.activeBets.has(m.id));

    for (const market of allCandidates.slice(0, 3)) {
      if (market.outcomePrices.length < 2) continue;

      const yesPrice = market.outcomePrices[0];
      const noPrice = market.outcomePrices[1] || (1 - yesPrice);

      // Check if Claude has analyzed this market
      const analysis = this.claudeAnalysis.get(market.id);

      if (analysis && analysis.confidence > 60) {
        const edge = analysis.probability - yesPrice;

        if (Math.abs(edge) > EDGE_THRESHOLD) {
          const side = edge > 0 ? 'Yes' : 'No';
          const price = edge > 0 ? yesPrice : noPrice;
          const betSize = Math.min(
            maxBet,
            allocation * 0.15,
            allocation * (analysis.confidence / 100) * 0.3
          );

          actions.push({
            id: uuidv4(),
            strategyName: this.name,
            type: 'buy_prediction',
            platform: 'polymarket',
            asset: market.title,
            amount: betSize,
            price,
            side: side === 'Yes' ? 'buy' : 'sell',
            confidence: analysis.confidence,
            urgency: Math.abs(edge) > 0.2 ? 'high' : 'medium',
            reasoning: `Polymarket: "${market.title}" | Market: ${(yesPrice * 100).toFixed(0)}% YES | Claude estimate: ${(analysis.probability * 100).toFixed(0)}% | Edge: ${(Math.abs(edge) * 100).toFixed(1)}% | Betting ${side} at $${price.toFixed(2)}`,
            metadata: {
              marketId: market.id,
              yesPrice, noPrice,
              claudeEstimate: analysis.probability,
              edge,
              volume24h: market.volume24h,
            },
            timestamp: new Date(),
          });

          this.activeBets.set(market.id, { marketId: market.id, side, price });
        }
      } else {
        // Without Claude analysis, use simple heuristics on crypto markets
        // Look for markets where volume spike suggests information asymmetry
        if (market.volume24h > 50000 && Math.abs(yesPrice - 0.5) < 0.1) {
          actions.push({
            id: uuidv4(),
            strategyName: this.name,
            type: 'no_action',
            platform: 'polymarket',
            asset: market.title,
            amount: 0,
            confidence: 30,
            urgency: 'low',
            reasoning: `Flagged for Claude analysis: "${market.title}" — high volume ($${(market.volume24h / 1000).toFixed(1)}k/24h), near 50/50 odds (${(yesPrice * 100).toFixed(0)}%). Requesting AI sentiment assessment.`,
            metadata: { marketId: market.id, needsAnalysis: true },
            timestamp: new Date(),
          });
        }
      }
    }

    return actions;
  }

  getStatus(): string {
    return `Active bets: ${this.activeBets.size} | Markets analyzed by Claude: ${this.claudeAnalysis.size}`;
  }
}
