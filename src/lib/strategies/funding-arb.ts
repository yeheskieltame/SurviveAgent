/**
 * Funding Rate Arbitrage Strategy
 * Delta-neutral: long spot + short perp (or vice versa) to collect funding
 * Consistent, low-risk returns — the bread and butter of the system
 */
import { v4 as uuidv4 } from 'uuid';
import { MarketEvent } from '../collectors/base';
import { BaseStrategy, TradeAction } from './base';
import { FundingSnapshot } from '../collectors/funding-collector';

const MIN_FUNDING_RATE = 0.01;  // minimum 0.01% per period to trade
const MIN_ANNUALIZED = 5;       // minimum 5% annualized to be worth it

export class FundingArbStrategy extends BaseStrategy {
  name = 'Funding Rate Arbitrage';
  platform = 'hyperliquid' as const;

  private activePositions: Map<string, { symbol: string; rate: number; side: 'long' | 'short' }> = new Map();

  processEvent(event: MarketEvent, portfolioValue: number): TradeAction[] {
    if (event.type !== 'funding_rate') return [];

    const actions: TradeAction[] = [];
    const rates = event.data.rates as Record<string, FundingSnapshot>;
    const allocation = portfolioValue * (this.state.allocation / 100);

    for (const [key, rate] of Object.entries(rates)) {
      // High positive funding → short perp + long spot = collect funding
      if (rate.rate > MIN_FUNDING_RATE && rate.annualizedRate > MIN_ANNUALIZED) {
        const posSize = Math.min(allocation * 0.3, portfolioValue * 0.1); // max 10% per position
        if (!this.activePositions.has(key)) {
          actions.push({
            id: uuidv4(),
            strategyName: this.name,
            type: 'open_short',
            platform: rate.exchange === 'Hyperliquid' ? 'hyperliquid' : 'hyperliquid',
            asset: `${rate.symbol}/USD`,
            amount: posSize,
            side: 'short',
            leverage: 1,
            confidence: Math.min(90, 50 + rate.annualizedRate),
            urgency: rate.rate > 0.05 ? 'high' : 'medium',
            reasoning: `Funding rate ${rate.rate.toFixed(4)}% (${rate.annualizedRate.toFixed(1)}% APR). Delta-neutral short to collect funding on ${rate.exchange}.`,
            metadata: { fundingRate: rate.rate, annualized: rate.annualizedRate, exchange: rate.exchange },
            timestamp: new Date(),
          });
          this.activePositions.set(key, { symbol: rate.symbol, rate: rate.rate, side: 'short' });
        }
      }

      // High negative funding → long perp = collect negative funding
      if (rate.rate < -MIN_FUNDING_RATE && Math.abs(rate.annualizedRate) > MIN_ANNUALIZED) {
        const posSize = Math.min(allocation * 0.3, portfolioValue * 0.1);
        if (!this.activePositions.has(key)) {
          actions.push({
            id: uuidv4(),
            strategyName: this.name,
            type: 'open_long',
            platform: 'hyperliquid',
            asset: `${rate.symbol}/USD`,
            amount: posSize,
            side: 'long',
            leverage: 1,
            confidence: Math.min(90, 50 + Math.abs(rate.annualizedRate)),
            urgency: Math.abs(rate.rate) > 0.05 ? 'high' : 'medium',
            reasoning: `Negative funding ${rate.rate.toFixed(4)}% (${Math.abs(rate.annualizedRate).toFixed(1)}% APR). Long perp to collect funding.`,
            metadata: { fundingRate: rate.rate, annualized: rate.annualizedRate },
            timestamp: new Date(),
          });
          this.activePositions.set(key, { symbol: rate.symbol, rate: rate.rate, side: 'long' });
        }
      }

      // Close positions where funding has flipped
      if (this.activePositions.has(key)) {
        const pos = this.activePositions.get(key)!;
        if (pos.side === 'short' && rate.rate < 0) {
          actions.push({
            id: uuidv4(),
            strategyName: this.name,
            type: 'close_position',
            platform: 'hyperliquid',
            asset: `${rate.symbol}/USD`,
            amount: 0,
            confidence: 80,
            urgency: 'medium',
            reasoning: `Funding flipped negative (${rate.rate.toFixed(4)}%). Closing short position.`,
            timestamp: new Date(),
          });
          this.activePositions.delete(key);
        }
      }
    }

    return actions;
  }

  getStatus(): string {
    return `Active positions: ${this.activePositions.size} | Collecting funding on ${[...this.activePositions.values()].map(p => p.symbol).join(', ') || 'none'}`;
  }
}
