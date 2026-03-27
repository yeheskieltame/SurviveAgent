/**
 * Aggregates all market data into a single context for Claude
 */
import { fetchCryptoPrices, formatPriceContext, PriceData } from './crypto-prices';
import { fetchCryptoNews, formatNewsContext, NewsData } from './twitter-news';
import { fetchAllDeFiData, formatDeFiContext, DeFiData } from './defi-data';

export interface MarketContext {
  prices: PriceData;
  news: NewsData;
  defi: DeFiData;
  timestamp: Date;
  formattedContext: string;
}

export async function gatherMarketData(): Promise<MarketContext> {
  const [prices, news, defi] = await Promise.allSettled([
    fetchCryptoPrices(),
    fetchCryptoNews(),
    fetchAllDeFiData(),
  ]);

  const pricesData = prices.status === 'fulfilled' ? prices.value : { prices: [], timestamp: new Date(), source: 'error' };
  const newsData = news.status === 'fulfilled' ? news.value : { tweets: [], timestamp: new Date(), source: 'error', query: '' };
  const defiData = defi.status === 'fulfilled' ? defi.value : { topYields: [], fundingRates: [], timestamp: new Date() };

  const formattedContext = [
    formatPriceContext(pricesData),
    '',
    formatNewsContext(newsData),
    '',
    formatDeFiContext(defiData),
  ].join('\n');

  return {
    prices: pricesData,
    news: newsData,
    defi: defiData,
    timestamp: new Date(),
    formattedContext,
  };
}
