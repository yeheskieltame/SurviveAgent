/**
 * Twitter/X news fetcher via FXTwitter (public, no auth needed)
 * FXTwitter provides Twitter data via a public API
 */

export interface Tweet {
  id: string;
  text: string;
  author: string;
  authorHandle: string;
  likes: number;
  retweets: number;
  timestamp: string;
  url: string;
}

export interface NewsData {
  tweets: Tweet[];
  timestamp: Date;
  source: string;
  query: string;
}

const FXTWITTER_BASE = 'https://api.fxtwitter.com';

// Crypto influencer accounts to monitor
const TRACKED_ACCOUNTS = [
  'CryptoCapo_',
  'inversebrah',
  'HsakaTrades',
  'EmberCN',
  'lookonchain',
  'WuBlockchain',
  'Cointelegraph',
  'whale_alert',
];

// Search queries for crypto news
const SEARCH_QUERIES = [
  'crypto market breaking',
  'bitcoin pump dump',
  'ethereum update',
  'solana defi',
  'airdrop confirmed',
  'memecoin launch',
];

let newsCache: Map<string, NewsData> = new Map();
const NEWS_CACHE_TTL = 60_000; // 60s cache

export async function fetchTwitterFeed(username: string): Promise<NewsData> {
  const cacheKey = `user:${username}`;
  const cached = newsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp.getTime() < NEWS_CACHE_TTL) {
    return cached;
  }

  try {
    const res = await fetch(`${FXTWITTER_BASE}/${username}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      console.warn(`FXTwitter returned ${res.status} for ${username}`);
      return cached || getEmptyNews(username);
    }

    const data = await res.json();
    const tweets: Tweet[] = [];

    if (data.tweets) {
      for (const t of Array.isArray(data.tweets) ? data.tweets : [data.tweets]) {
        tweets.push({
          id: t.id || String(Date.now()),
          text: t.text || '',
          author: t.author?.name || username,
          authorHandle: t.author?.screen_name || username,
          likes: t.likes || 0,
          retweets: t.retweets || 0,
          timestamp: t.created_at || new Date().toISOString(),
          url: t.url || `https://x.com/${username}`,
        });
      }
    }

    // Also try single tweet endpoint format
    if (data.tweet) {
      const t = data.tweet;
      tweets.push({
        id: t.id || String(Date.now()),
        text: t.text || '',
        author: t.author?.name || username,
        authorHandle: t.author?.screen_name || username,
        likes: t.likes || 0,
        retweets: t.retweets || 0,
        timestamp: t.created_at || new Date().toISOString(),
        url: t.url || `https://x.com/${username}`,
      });
    }

    const result: NewsData = {
      tweets,
      timestamp: new Date(),
      source: 'fxtwitter',
      query: username,
    };

    newsCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Failed to fetch tweets for ${username}:`, err);
    return cached || getEmptyNews(username);
  }
}

export async function fetchCryptoNews(): Promise<NewsData> {
  const allTweets: Tweet[] = [];

  // Fetch from tracked accounts in parallel (limit concurrency)
  const accountBatch = TRACKED_ACCOUNTS.slice(0, 4); // fetch 4 at a time to avoid rate limits
  const results = await Promise.allSettled(
    accountBatch.map(account => fetchTwitterFeed(account))
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.tweets.length > 0) {
      allTweets.push(...result.value.tweets);
    }
  }

  // Sort by engagement
  allTweets.sort((a, b) => (b.likes + b.retweets) - (a.likes + a.retweets));

  return {
    tweets: allTweets.slice(0, 20),
    timestamp: new Date(),
    source: 'fxtwitter-aggregated',
    query: 'crypto-news',
  };
}

function getEmptyNews(query: string): NewsData {
  return { tweets: [], timestamp: new Date(), source: 'empty', query };
}

export function formatNewsContext(data: NewsData): string {
  if (data.tweets.length === 0) {
    return '=== CRYPTO NEWS (X/Twitter) ===\nNo recent news available.';
  }

  const lines = data.tweets.slice(0, 10).map((t, i) =>
    `[${i + 1}] @${t.authorHandle}: ${t.text.slice(0, 200)}${t.text.length > 200 ? '...' : ''} (❤️${t.likes} 🔄${t.retweets})`
  );
  return `=== CRYPTO NEWS FROM X (via FXTwitter) ===\n${lines.join('\n')}`;
}

export { TRACKED_ACCOUNTS, SEARCH_QUERIES };
