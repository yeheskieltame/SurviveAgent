/**
 * Momentum Trading Strategy
 * Uses price action + sentiment to ride trends on Hyperliquid perps
 * Higher risk, higher reward
 */
import { v4 as uuidv4 } from 'uuid';
import { MarketEvent } from '../collectors/base';
import { BaseStrategy, TradeAction } from './base';
import { PriceSnapshot } from '../collectors/price-collector';

export class MomentumStrategy extends BaseStrategy {
  name = 'Momentum Trader';
  platform = 'hyperliquid' as const;

  private priceHistory: Map<string, number[]> = new Map();
  private sentimentBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  private fearGreed: number = 50;

  processEvent(event: MarketEvent, portfolioValue: number): TradeAction[] {
    const actions: TradeAction[] = [];
    const allocation = portfolioValue * (this.state.allocation / 100);

    if (event.type === 'sentiment_shift') {
      this.fearGreed = (event.data.fearGreed as number) || 50;
      const sentiment = event.data.sentiment as Record<string, unknown>;
      if (sentiment) {
        this.sentimentBias = (sentiment.overallSentiment as string)?.includes('greed') ? 'bullish'
          : (sentiment.overallSentiment as string)?.includes('fear') ? 'bearish'
          : 'neutral';
      }
    }

    if (event.type === 'price_update') {
      const allPrices = event.data.allPrices as Record<string, PriceSnapshot>;
      if (!allPrices) return actions;

      // Track major assets
      const targets = ['BTC', 'ETH', 'SOL', 'SUI', 'INJ', 'APT'];

      for (const symbol of targets) {
        const price = allPrices[symbol];
        if (!price) continue;

        // Track price history
        const history = this.priceHistory.get(symbol) || [];
        history.push(price.price);
        if (history.length > 20) history.shift();
        this.priceHistory.set(symbol, history);

        const change = price.change24h;

        // Strong momentum signal: >3% move with sentiment alignment
        if (Math.abs(change) > 3 && history.length >= 5) {
          const isTrending = this.isTrending(history);
          const sentimentAligned =
            (change > 0 && this.sentimentBias !== 'bearish') ||
            (change < 0 && this.sentimentBias !== 'bullish');

          if (isTrending && sentimentAligned) {
            const side = change > 0 ? 'long' : 'short';
            const posSize = Math.min(
              allocation * 0.25,
              portfolioValue * 0.05 // max 5% per trade
            );
            const stopDistance = Math.abs(change) * 0.4; // 40% of move as stop
            const stopLoss = side === 'long'
              ? price.price * (1 - stopDistance / 100)
              : price.price * (1 + stopDistance / 100);
            const takeProfit = side === 'long'
              ? price.price * (1 + Math.abs(change) * 0.8 / 100)
              : price.price * (1 - Math.abs(change) * 0.8 / 100);

            actions.push({
              id: uuidv4(),
              strategyName: this.name,
              type: side === 'long' ? 'open_long' : 'open_short',
              platform: 'hyperliquid',
              asset: `${symbol}/USD`,
              amount: posSize,
              price: price.price,
              stopLoss,
              takeProfit,
              leverage: 3, // moderate leverage
              side,
              confidence: Math.min(85, 40 + Math.abs(change) * 5 + (sentimentAligned ? 15 : 0)),
              urgency: Math.abs(change) > 5 ? 'high' : 'medium',
              reasoning: `${symbol} ${change > 0 ? '+' : ''}${change.toFixed(2)}% momentum. Trend: ${isTrending ? 'confirmed' : 'emerging'}. Sentiment: ${this.sentimentBias}. Fear/Greed: ${this.fearGreed}. R:R targeting ${(Math.abs(change) * 0.8).toFixed(1)}%.`,
              metadata: { change24h: change, fearGreed: this.fearGreed, sentiment: this.sentimentBias },
              timestamp: new Date(),
            });
          }
        }

        // Extreme Fear = contrarian buy (BTC/ETH only at >10% drop)
        if (this.fearGreed < 20 && change < -10 && ['BTC', 'ETH'].includes(symbol)) {
          actions.push({
            id: uuidv4(),
            strategyName: this.name,
            type: 'open_long',
            platform: 'hyperliquid',
            asset: `${symbol}/USD`,
            amount: Math.min(allocation * 0.15, portfolioValue * 0.03),
            price: price.price,
            stopLoss: price.price * 0.92,
            takeProfit: price.price * 1.15,
            leverage: 2,
            side: 'long',
            confidence: 60,
            urgency: 'high',
            reasoning: `Extreme Fear (${this.fearGreed}) + ${symbol} dumped ${change.toFixed(1)}%. Contrarian long with tight stop.`,
            timestamp: new Date(),
          });
        }
      }
    }

    return actions;
  }

  private isTrending(history: number[]): boolean {
    if (history.length < 5) return false;
    const recent = history.slice(-5);
    let increasing = 0, decreasing = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] > recent[i - 1]) increasing++;
      else decreasing++;
    }
    return increasing >= 4 || decreasing >= 4;
  }

  getStatus(): string {
    return `Sentiment: ${this.sentimentBias} | Fear/Greed: ${this.fearGreed} | Tracking: ${this.priceHistory.size} assets`;
  }
}
