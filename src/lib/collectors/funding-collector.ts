/**
 * Funding Rate Collector
 * Sources: Binance Futures, Hyperliquid
 */
import { BaseCollector } from './base';
import { v4 as uuidv4 } from 'uuid';

export interface FundingSnapshot {
  exchange: string;
  symbol: string;
  rate: number;           // current funding rate (%)
  predictedRate: number;  // predicted next rate (%)
  nextFundingTime: number;
  annualizedRate: number; // annualized APR from funding
}

export class FundingCollector extends BaseCollector {
  name = 'FundingCollector';
  private timer: NodeJS.Timeout | null = null;
  private rates: Map<string, FundingSnapshot> = new Map();

  async start() {
    this.running = true;
    await this.fetchRates();
    this.timer = setInterval(() => this.fetchRates(), 60_000); // every 60s
  }

  private async fetchRates() {
    if (!this.running) return;

    // Binance futures funding rates
    const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'AVAXUSDT', 'ARBUSDT', 'SUIUSDT', 'INJUSDT'];

    try {
      const results = await Promise.allSettled(
        pairs.map(async (symbol) => {
          const res = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
          if (!res.ok) return null;
          return res.json();
        })
      );

      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        const d = result.value;
        const rate = parseFloat(d.lastFundingRate) * 100;
        const snapshot: FundingSnapshot = {
          exchange: 'Binance',
          symbol: d.symbol.replace('USDT', ''),
          rate,
          predictedRate: parseFloat(d.markPrice) > parseFloat(d.indexPrice) ? rate * 1.1 : rate * 0.9,
          nextFundingTime: d.nextFundingTime,
          annualizedRate: rate * 3 * 365, // 3 funding periods per day
        };
        this.rates.set(`binance:${snapshot.symbol}`, snapshot);
      }

      this.emit({
        id: uuidv4(),
        type: 'funding_rate',
        source: 'binance-futures',
        timestamp: new Date(),
        data: {
          rates: Object.fromEntries(this.rates),
          count: this.rates.size,
          bestLong: this.findBestRate('short'), // short = collect positive funding
          bestShort: this.findBestRate('long'),
        },
        priority: this.hasHighFunding() ? 'high' : 'low',
      });
    } catch (err) {
      console.error('[FundingCollector] Fetch failed:', err);
    }

    // Hyperliquid funding rates
    try {
      const res = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length >= 2) {
          const meta = data[0];
          const ctxs = data[1];
          if (meta?.universe && Array.isArray(ctxs)) {
            for (let i = 0; i < Math.min(meta.universe.length, ctxs.length); i++) {
              const asset = meta.universe[i];
              const ctx = ctxs[i];
              if (ctx.funding) {
                const rate = parseFloat(ctx.funding) * 100;
                const snapshot: FundingSnapshot = {
                  exchange: 'Hyperliquid',
                  symbol: asset.name,
                  rate,
                  predictedRate: rate,
                  nextFundingTime: Date.now() + 3600000,
                  annualizedRate: rate * 24 * 365, // hourly funding on HL
                };
                this.rates.set(`hl:${asset.name}`, snapshot);
              }
            }
          }
        }

        this.emit({
          id: uuidv4(),
          type: 'funding_rate',
          source: 'hyperliquid',
          timestamp: new Date(),
          data: { rates: Object.fromEntries(this.rates) },
          priority: 'medium',
        });
      }
    } catch (err) {
      console.error('[FundingCollector] Hyperliquid fetch failed:', err);
    }
  }

  private findBestRate(direction: 'long' | 'short'): FundingSnapshot | null {
    let best: FundingSnapshot | null = null;
    for (const rate of this.rates.values()) {
      if (direction === 'short' && rate.rate > 0) {
        if (!best || rate.rate > best.rate) best = rate;
      }
      if (direction === 'long' && rate.rate < 0) {
        if (!best || rate.rate < best.rate) best = rate;
      }
    }
    return best;
  }

  private hasHighFunding(): boolean {
    for (const rate of this.rates.values()) {
      if (Math.abs(rate.rate) > 0.05) return true; // >0.05% is significant
    }
    return false;
  }

  getRates(): Map<string, FundingSnapshot> {
    return new Map(this.rates);
  }

  stop() {
    super.stop();
    if (this.timer) clearInterval(this.timer);
  }
}
