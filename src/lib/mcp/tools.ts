/**
 * MCP-style tools that Claude can invoke through the agent system.
 * These provide the agent with capabilities to interact with the Web3 world.
 */

import { fetchCryptoPrices } from '../data/crypto-prices';
import { fetchCryptoNews, fetchTwitterFeed } from '../data/twitter-news';
import { fetchAllDeFiData, fetchFundingRates } from '../data/defi-data';

export interface ToolResult {
  success: boolean;
  data: unknown;
  message: string;
}

export type ToolFunction = (params: Record<string, unknown>) => Promise<ToolResult>;

/**
 * Registry of all tools available to the agent
 */
export const AGENT_TOOLS: Record<string, {
  name: string;
  description: string;
  parameters: Record<string, string>;
  execute: ToolFunction;
}> = {
  get_crypto_prices: {
    name: 'get_crypto_prices',
    description: 'Fetch current crypto market prices for major tokens',
    parameters: {},
    execute: async () => {
      const data = await fetchCryptoPrices();
      return {
        success: true,
        data: data.prices,
        message: `Fetched ${data.prices.length} prices from ${data.source}`,
      };
    },
  },

  get_crypto_news: {
    name: 'get_crypto_news',
    description: 'Fetch latest crypto news from X/Twitter via FXTwitter',
    parameters: {},
    execute: async () => {
      const data = await fetchCryptoNews();
      return {
        success: true,
        data: data.tweets,
        message: `Fetched ${data.tweets.length} tweets from ${data.source}`,
      };
    },
  },

  get_twitter_feed: {
    name: 'get_twitter_feed',
    description: 'Fetch tweets from a specific X/Twitter account',
    parameters: { username: 'Twitter username to fetch' },
    execute: async (params) => {
      const username = params.username as string;
      if (!username) return { success: false, data: null, message: 'Username required' };
      const data = await fetchTwitterFeed(username);
      return {
        success: true,
        data: data.tweets,
        message: `Fetched ${data.tweets.length} tweets from @${username}`,
      };
    },
  },

  get_defi_yields: {
    name: 'get_defi_yields',
    description: 'Fetch top DeFi yield farming opportunities from DeFi Llama',
    parameters: {},
    execute: async () => {
      const data = await fetchAllDeFiData();
      return {
        success: true,
        data: data.topYields,
        message: `Fetched ${data.topYields.length} yield pools`,
      };
    },
  },

  get_funding_rates: {
    name: 'get_funding_rates',
    description: 'Fetch current perp funding rates from Binance',
    parameters: {},
    execute: async () => {
      const rates = await fetchFundingRates();
      return {
        success: true,
        data: rates,
        message: `Fetched ${rates.length} funding rates`,
      };
    },
  },

  calculate_position_size: {
    name: 'calculate_position_size',
    description: 'Calculate safe position size based on portfolio and risk parameters',
    parameters: {
      portfolio_value: 'Total portfolio value in USD',
      risk_percent: 'Max risk as percentage (1-5)',
      entry_price: 'Entry price of asset',
      stop_loss_price: 'Stop loss price',
    },
    execute: async (params) => {
      const portfolioValue = Number(params.portfolio_value);
      const riskPercent = Math.min(5, Math.max(0.5, Number(params.risk_percent)));
      const entryPrice = Number(params.entry_price);
      const stopLossPrice = Number(params.stop_loss_price);

      const riskAmount = portfolioValue * (riskPercent / 100);
      const priceDiff = Math.abs(entryPrice - stopLossPrice);
      const positionSize = priceDiff > 0 ? riskAmount / (priceDiff / entryPrice) : 0;

      return {
        success: true,
        data: {
          positionSize: Math.round(positionSize * 100) / 100,
          riskAmount: Math.round(riskAmount * 100) / 100,
          riskPercent,
          leverage: positionSize > 0 ? Math.round((positionSize / portfolioValue) * 10) / 10 : 0,
        },
        message: `Position size: $${positionSize.toFixed(2)} with ${riskPercent}% risk`,
      };
    },
  },

  evaluate_trade: {
    name: 'evaluate_trade',
    description: 'Evaluate a potential trade with risk/reward analysis',
    parameters: {
      pair: 'Trading pair',
      side: 'long or short',
      entry: 'Entry price',
      target: 'Target price',
      stop: 'Stop loss price',
      amount: 'Position size in USD',
    },
    execute: async (params) => {
      const entry = Number(params.entry);
      const target = Number(params.target);
      const stop = Number(params.stop);
      const amount = Number(params.amount);
      const side = params.side as string;

      let reward: number, risk: number;
      if (side === 'long') {
        reward = ((target - entry) / entry) * amount;
        risk = ((entry - stop) / entry) * amount;
      } else {
        reward = ((entry - target) / entry) * amount;
        risk = ((stop - entry) / entry) * amount;
      }

      const rrRatio = risk > 0 ? reward / risk : 0;

      return {
        success: true,
        data: {
          pair: params.pair,
          side,
          potentialReward: Math.round(reward * 100) / 100,
          potentialRisk: Math.round(risk * 100) / 100,
          riskRewardRatio: Math.round(rrRatio * 100) / 100,
          recommendation: rrRatio >= 2 ? 'FAVORABLE' : rrRatio >= 1.5 ? 'ACCEPTABLE' : 'UNFAVORABLE',
        },
        message: `R:R ratio ${rrRatio.toFixed(2)} - ${rrRatio >= 2 ? 'Favorable' : 'Unfavorable'}`,
      };
    },
  },
};

/**
 * Execute a tool by name
 */
export async function executeTool(toolName: string, params: Record<string, unknown> = {}): Promise<ToolResult> {
  const tool = AGENT_TOOLS[toolName];
  if (!tool) {
    return { success: false, data: null, message: `Unknown tool: ${toolName}` };
  }
  return tool.execute(params);
}

/**
 * Get tool descriptions for Claude's context
 */
export function getToolDescriptions(): string {
  return Object.values(AGENT_TOOLS)
    .map(t => `- ${t.name}: ${t.description}`)
    .join('\n');
}
