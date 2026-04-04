/**
 * Polymarket Collector
 * Fetches prediction markets, odds, and volume data
 * Source: Polymarket Gamma API (public, no auth for reading)
 */
import { BaseCollector } from './base';
import { v4 as uuidv4 } from 'uuid';

export interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  outcomes: string[];
  outcomePrices: number[];
  volume: number;
  volume24h: number;
  liquidity: number;
  endDate: string;
  active: boolean;
  category: string;
}

const GAMMA_API = 'https://gamma-api.polymarket.com';

export class PolymarketCollector extends BaseCollector {
  name = 'PolymarketCollector';
  private timer: NodeJS.Timeout | null = null;
  private markets: PolymarketEvent[] = [];

  async start() {
    this.running = true;
    await this.fetchMarkets();
    this.timer = setInterval(() => this.fetchMarkets(), 180_000); // every 3 min
  }

  private async fetchMarkets() {
    if (!this.running) return;

    try {
      // Fetch active crypto-related markets
      const res = await fetch(
        `${GAMMA_API}/events?active=true&closed=false&limit=50&order=volume24hr&ascending=false`
      );

      if (!res.ok) {
        console.warn('[PolymarketCollector] Gamma API returned', res.status);
        return;
      }

      const events = await res.json();
      this.markets = [];

      for (const event of events) {
        if (!event.markets || event.markets.length === 0) continue;

        // Aggregate market data
        const market = event.markets[0]; // primary market
        const outcomePrices: number[] = [];

        try {
          if (market.outcomePrices) {
            const prices = JSON.parse(market.outcomePrices);
            outcomePrices.push(...prices.map(Number));
          }
        } catch {}

        const pm: PolymarketEvent = {
          id: event.id || market.id,
          title: event.title || market.question || '',
          slug: event.slug || '',
          description: (event.description || '').slice(0, 300),
          outcomes: market.outcomes ? JSON.parse(market.outcomes) : ['Yes', 'No'],
          outcomePrices,
          volume: parseFloat(market.volume || '0'),
          volume24h: parseFloat(market.volume24hr || '0'),
          liquidity: parseFloat(market.liquidity || '0'),
          endDate: market.endDate || event.endDate || '',
          active: market.active !== false,
          category: event.category || '',
        };

        this.markets.push(pm);
      }

      // Filter for crypto-related or high-volume markets
      const cryptoMarkets = this.markets.filter(m =>
        /crypto|bitcoin|btc|ethereum|eth|solana|defi|blockchain|sec|token|coin/i.test(m.title + m.description)
      );

      const topVolume = [...this.markets]
        .sort((a, b) => b.volume24h - a.volume24h)
        .slice(0, 10);

      // Find mispriced markets (odds very close to 50/50 with high volume = uncertain = potential alpha)
      const mispricedCandidates = this.markets.filter(m => {
        if (m.outcomePrices.length < 2) return false;
        const spread = Math.abs(m.outcomePrices[0] - 0.5);
        return spread < 0.15 && m.volume24h > 10000; // close to 50/50 + decent volume
      });

      this.emit({
        id: uuidv4(),
        type: 'polymarket_update',
        source: 'polymarket-gamma',
        timestamp: new Date(),
        data: {
          totalMarkets: this.markets.length,
          cryptoMarkets: cryptoMarkets.slice(0, 10),
          topVolume,
          mispricedCandidates: mispricedCandidates.slice(0, 5),
          totalVolume24h: this.markets.reduce((s, m) => s + m.volume24h, 0),
        },
        priority: cryptoMarkets.length > 0 ? 'medium' : 'low',
      });
    } catch (err) {
      console.error('[PolymarketCollector] Fetch failed:', err);
    }
  }

  getMarkets(): PolymarketEvent[] {
    return [...this.markets];
  }

  getCryptoMarkets(): PolymarketEvent[] {
    return this.markets.filter(m =>
      /crypto|bitcoin|btc|ethereum|eth|solana|defi|blockchain|sec|token|coin/i.test(m.title)
    );
  }

  stop() {
    super.stop();
    if (this.timer) clearInterval(this.timer);
  }
}
