/**
 * Crypto price fetcher using CoinGecko public API (no key needed)
 */

export interface CryptoPrice {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  price_change_percentage_1h_in_currency?: number;
  market_cap: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
}

export interface PriceData {
  prices: CryptoPrice[];
  timestamp: Date;
  source: string;
}

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const TRACKED_COINS = 'bitcoin,ethereum,solana,arbitrum,avalanche-2,dogecoin,shiba-inu,pepe,bonk,chainlink';

let priceCache: PriceData | null = null;
let lastFetch = 0;
const CACHE_TTL = 30_000; // 30s cache

export async function fetchCryptoPrices(): Promise<PriceData> {
  const now = Date.now();
  if (priceCache && now - lastFetch < CACHE_TTL) {
    return priceCache;
  }

  try {
    const res = await fetch(
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${TRACKED_COINS}&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=1h,24h`,
      {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 30 },
      }
    );

    if (!res.ok) {
      console.warn(`CoinGecko API returned ${res.status}, using cache or fallback`);
      if (priceCache) return priceCache;
      return getFallbackPrices();
    }

    const data = await res.json();
    priceCache = {
      prices: data.map((coin: Record<string, unknown>) => ({
        id: coin.id,
        symbol: (coin.symbol as string).toUpperCase(),
        name: coin.name,
        current_price: coin.current_price,
        price_change_percentage_24h: coin.price_change_percentage_24h || 0,
        price_change_percentage_1h_in_currency: coin.price_change_percentage_1h_in_currency || 0,
        market_cap: coin.market_cap,
        total_volume: coin.total_volume,
        high_24h: coin.high_24h,
        low_24h: coin.low_24h,
      })),
      timestamp: new Date(),
      source: 'coingecko',
    };
    lastFetch = now;
    return priceCache;
  } catch (err) {
    console.error('Failed to fetch crypto prices:', err);
    if (priceCache) return priceCache;
    return getFallbackPrices();
  }
}

function getFallbackPrices(): PriceData {
  return {
    prices: [
      { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', current_price: 67000, price_change_percentage_24h: 1.2, market_cap: 1300000000000, total_volume: 30000000000, high_24h: 68000, low_24h: 66000 },
      { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', current_price: 3500, price_change_percentage_24h: 0.8, market_cap: 420000000000, total_volume: 15000000000, high_24h: 3550, low_24h: 3450 },
      { id: 'solana', symbol: 'SOL', name: 'Solana', current_price: 145, price_change_percentage_24h: 2.5, market_cap: 63000000000, total_volume: 3000000000, high_24h: 148, low_24h: 140 },
    ],
    timestamp: new Date(),
    source: 'fallback',
  };
}

export function formatPriceContext(data: PriceData): string {
  const lines = data.prices.map(p =>
    `${p.symbol}: $${p.current_price.toLocaleString()} (${p.price_change_percentage_24h >= 0 ? '+' : ''}${p.price_change_percentage_24h.toFixed(2)}% 24h) | Vol: $${(p.total_volume / 1e9).toFixed(2)}B | Range: $${p.low_24h.toLocaleString()}-$${p.high_24h.toLocaleString()}`
  );
  return `=== LIVE CRYPTO PRICES (${data.source}) ===\n${lines.join('\n')}`;
}
