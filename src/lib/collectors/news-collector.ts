/**
 * News & Sentiment Collector
 * Sources: FXTwitter (X/Twitter), CoinGecko trending, Fear & Greed Index
 */
import { BaseCollector } from './base';
import { v4 as uuidv4 } from 'uuid';

export interface NewsItem {
  id: string;
  text: string;
  author: string;
  handle: string;
  likes: number;
  retweets: number;
  timestamp: string;
  url: string;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  relevance: number; // 0-100
}

export interface SentimentData {
  fearGreedIndex: number; // 0-100
  fearGreedLabel: string;
  trendingCoins: string[];
  newsItems: NewsItem[];
  overallSentiment: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
}

const CRYPTO_ACCOUNTS = [
  'CryptoCapo_', 'HsakaTrades', 'EmberCN', 'lookonchain',
  'WuBlockchain', 'whale_alert', 'zachxbt', 'DefiIgnas',
  'Pentosh1', 'CryptoKaleo', 'AltcoinGordon', 'inversebrah',
];

// Simple keyword-based sentiment for speed (Claude does deeper analysis)
const BULLISH_KEYWORDS = ['pump', 'moon', 'bullish', 'breakout', 'ath', 'buy', 'long', 'accumulate', 'rally', 'surge', 'green', 'higher', 'up'];
const BEARISH_KEYWORDS = ['dump', 'crash', 'bearish', 'breakdown', 'sell', 'short', 'liquidat', 'fear', 'rug', 'scam', 'red', 'lower', 'down'];

export class NewsCollector extends BaseCollector {
  name = 'NewsCollector';
  private timer: NodeJS.Timeout | null = null;
  private sentimentData: SentimentData = {
    fearGreedIndex: 50,
    fearGreedLabel: 'Neutral',
    trendingCoins: [],
    newsItems: [],
    overallSentiment: 'neutral',
  };

  async start() {
    this.running = true;
    await this.fetchAll();
    this.timer = setInterval(() => this.fetchAll(), 120_000); // every 2 min
  }

  private async fetchAll() {
    if (!this.running) return;

    await Promise.allSettled([
      this.fetchFearGreed(),
      this.fetchTwitterNews(),
      this.fetchTrendingCoins(),
    ]);

    // Calculate overall sentiment
    this.calculateOverallSentiment();

    this.emit({
      id: uuidv4(),
      type: 'sentiment_shift',
      source: 'news-aggregator',
      timestamp: new Date(),
      data: {
        sentiment: this.sentimentData,
        fearGreed: this.sentimentData.fearGreedIndex,
        newsCount: this.sentimentData.newsItems.length,
        trending: this.sentimentData.trendingCoins,
      },
      priority: this.sentimentData.fearGreedIndex < 20 || this.sentimentData.fearGreedIndex > 80 ? 'high' : 'medium',
    });
  }

  private async fetchFearGreed() {
    try {
      const res = await fetch('https://api.alternative.me/fng/?limit=1');
      if (res.ok) {
        const data = await res.json();
        if (data.data?.[0]) {
          this.sentimentData.fearGreedIndex = parseInt(data.data[0].value);
          this.sentimentData.fearGreedLabel = data.data[0].value_classification;
        }
      }
    } catch {}
  }

  private async fetchTwitterNews() {
    // Fetch from random subset of accounts to avoid rate limits
    const shuffled = [...CRYPTO_ACCOUNTS].sort(() => Math.random() - 0.5);
    const batch = shuffled.slice(0, 3);
    const allNews: NewsItem[] = [];

    for (const account of batch) {
      try {
        const res = await fetch(`https://api.fxtwitter.com/${account}`);
        if (!res.ok) continue;

        const data = await res.json();
        const tweets = data.tweets || (data.tweet ? [data.tweet] : []);

        for (const t of tweets) {
          const text = t.text || '';
          const item: NewsItem = {
            id: t.id || uuidv4(),
            text,
            author: t.author?.name || account,
            handle: t.author?.screen_name || account,
            likes: t.likes || 0,
            retweets: t.retweets || 0,
            timestamp: t.created_at || new Date().toISOString(),
            url: t.url || `https://x.com/${account}`,
            sentiment: this.quickSentiment(text),
            relevance: this.calculateRelevance(t),
          };
          allNews.push(item);
        }
      } catch {}
    }

    // Sort by relevance (engagement-weighted)
    allNews.sort((a, b) => b.relevance - a.relevance);
    this.sentimentData.newsItems = allNews.slice(0, 30);

    if (allNews.length > 0) {
      this.emit({
        id: uuidv4(),
        type: 'news_signal',
        source: 'fxtwitter',
        timestamp: new Date(),
        data: {
          items: allNews.slice(0, 5),
          topItem: allNews[0],
        },
        priority: allNews[0]?.relevance > 80 ? 'high' : 'medium',
      });
    }
  }

  private async fetchTrendingCoins() {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/search/trending');
      if (res.ok) {
        const data = await res.json();
        this.sentimentData.trendingCoins = (data.coins || [])
          .slice(0, 7)
          .map((c: Record<string, Record<string, string>>) => c.item?.symbol || '');
      }
    } catch {}
  }

  private quickSentiment(text: string): 'bullish' | 'bearish' | 'neutral' {
    const lower = text.toLowerCase();
    let bullScore = 0, bearScore = 0;
    for (const kw of BULLISH_KEYWORDS) { if (lower.includes(kw)) bullScore++; }
    for (const kw of BEARISH_KEYWORDS) { if (lower.includes(kw)) bearScore++; }
    if (bullScore > bearScore + 1) return 'bullish';
    if (bearScore > bullScore + 1) return 'bearish';
    return 'neutral';
  }

  private calculateRelevance(tweet: Record<string, unknown>): number {
    const likes = (tweet.likes as number) || 0;
    const rts = (tweet.retweets as number) || 0;
    return Math.min(100, Math.log10(likes + rts * 2 + 1) * 20);
  }

  private calculateOverallSentiment() {
    const fg = this.sentimentData.fearGreedIndex;
    if (fg < 20) this.sentimentData.overallSentiment = 'extreme_fear';
    else if (fg < 40) this.sentimentData.overallSentiment = 'fear';
    else if (fg < 60) this.sentimentData.overallSentiment = 'neutral';
    else if (fg < 80) this.sentimentData.overallSentiment = 'greed';
    else this.sentimentData.overallSentiment = 'extreme_greed';
  }

  getSentiment(): SentimentData {
    return { ...this.sentimentData };
  }

  stop() {
    super.stop();
    if (this.timer) clearInterval(this.timer);
  }
}
