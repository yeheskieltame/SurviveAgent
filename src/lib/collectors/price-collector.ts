/**
 * Price Collector - Real-time crypto price feeds
 * Sources: CoinGecko (REST), Binance WebSocket
 */
import { BaseCollector, MarketEvent } from './base';
import { v4 as uuidv4 } from 'uuid';

interface BinanceTicker {
  s: string;  // symbol
  c: string;  // close price
  P: string;  // price change percent
  v: string;  // volume
  h: string;  // high
  l: string;  // low
}

export interface PriceSnapshot {
  symbol: string;
  price: number;
  change24h: number;
  volume: number;
  high24h: number;
  low24h: number;
  source: string;
}

export class PriceCollector extends BaseCollector {
  name = 'PriceCollector';
  private ws: WebSocket | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private prices: Map<string, PriceSnapshot> = new Map();

  // Binance symbols we track
  private symbols = [
    'btcusdt', 'ethusdt', 'solusdt', 'arbusdt', 'avaxusdt',
    'dogeusdt', 'pepeusdt', 'wifusdt', 'bonkusdt', 'linkusdt',
    'suiusdt', 'aptusdt', 'injusdt', 'tiausdt', 'jupusdt',
  ];

  async start() {
    this.running = true;

    // Try WebSocket first (Binance mini ticker stream)
    this.connectWebSocket();

    // Fallback: CoinGecko polling every 30s
    this.startPolling();
  }

  private connectWebSocket() {
    try {
      const streams = this.symbols.map(s => `${s}@miniTicker`).join('/');
      const url = `wss://stream.binance.com:9443/ws/${streams}`;

      // In Node.js environment, use ws package
      if (typeof WebSocket === 'undefined') {
        // Server-side: dynamic import ws
        import('ws').then(({ default: WS }) => {
          const ws = new WS(url);
          this.setupWSHandlers(ws as unknown as WebSocket);
        }).catch(() => {
          console.log('[PriceCollector] WebSocket not available, using polling only');
        });
      } else {
        this.ws = new WebSocket(url);
        this.setupWSHandlers(this.ws);
      }
    } catch {
      console.log('[PriceCollector] WebSocket failed, using polling');
    }
  }

  private setupWSHandlers(ws: WebSocket) {
    ws.onmessage = (event: MessageEvent) => {
      try {
        const data: BinanceTicker = JSON.parse(
          typeof event.data === 'string' ? event.data : event.data.toString()
        );
        const snapshot: PriceSnapshot = {
          symbol: data.s.replace('USDT', ''),
          price: parseFloat(data.c),
          change24h: parseFloat(data.P),
          volume: parseFloat(data.v),
          high24h: parseFloat(data.h),
          low24h: parseFloat(data.l),
          source: 'binance-ws',
        };

        this.prices.set(snapshot.symbol, snapshot);

        this.emit({
          id: uuidv4(),
          type: 'price_update',
          source: 'binance-ws',
          timestamp: new Date(),
          data: { snapshot, allPrices: Object.fromEntries(this.prices) },
          priority: Math.abs(snapshot.change24h) > 5 ? 'high' : 'low',
        });
      } catch {}
    };

    ws.onerror = () => {
      console.log('[PriceCollector] WebSocket error, relying on polling');
    };
  }

  private startPolling() {
    const poll = async () => {
      if (!this.running) return;
      try {
        const res = await fetch(
          'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,arbitrum,avalanche-2,dogecoin,pepe,bonk,chainlink,sui,aptos,injective-protocol,celestia,jupiter-exchange-solana&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=1h,24h,7d'
        );
        if (res.ok) {
          const coins = await res.json();
          for (const coin of coins) {
            const snapshot: PriceSnapshot = {
              symbol: (coin.symbol as string).toUpperCase(),
              price: coin.current_price,
              change24h: coin.price_change_percentage_24h || 0,
              volume: coin.total_volume || 0,
              high24h: coin.high_24h || 0,
              low24h: coin.low_24h || 0,
              source: 'coingecko',
            };
            this.prices.set(snapshot.symbol, snapshot);
          }

          this.emit({
            id: uuidv4(),
            type: 'price_update',
            source: 'coingecko-poll',
            timestamp: new Date(),
            data: {
              allPrices: Object.fromEntries(this.prices),
              count: coins.length,
            },
            priority: 'medium',
          });
        }
      } catch (err) {
        console.error('[PriceCollector] Poll failed:', err);
      }
    };

    poll(); // immediate
    this.pollTimer = setInterval(poll, 30_000);
  }

  getPrices(): Map<string, PriceSnapshot> {
    return new Map(this.prices);
  }

  stop() {
    super.stop();
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
