/**
 * Strategy Base - Artemis-style Strategy interface
 * Strategies consume MarketEvents and produce Actions for executors
 */
import { MarketEvent } from '../collectors/base';

export type ActionType =
  | 'open_long' | 'open_short' | 'close_position'
  | 'place_limit' | 'cancel_order'
  | 'swap' | 'bridge'
  | 'stake' | 'unstake' | 'claim'
  | 'buy_prediction' | 'sell_prediction'
  | 'snipe_token'
  | 'rebalance'
  | 'no_action';

export interface TradeAction {
  id: string;
  strategyName: string;
  type: ActionType;
  platform: 'hyperliquid' | 'jupiter' | 'polymarket' | 'pumpfun' | 'aave' | 'compound' | 'internal';
  asset: string;
  amount: number;          // USD amount
  price?: number;          // target price (for limits)
  stopLoss?: number;
  takeProfit?: number;
  leverage?: number;
  side?: 'long' | 'short' | 'buy' | 'sell';
  confidence: number;      // 0-100
  urgency: 'low' | 'medium' | 'high' | 'critical';
  reasoning: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface StrategyState {
  name: string;
  enabled: boolean;
  allocation: number;      // % of total portfolio
  currentExposure: number; // current USD exposure
  pnl: number;
  trades: number;
  winRate: number;
  signals: TradeAction[];  // pending signals
}

export abstract class BaseStrategy {
  abstract name: string;
  abstract platform: TradeAction['platform'];
  state: StrategyState = {
    name: '',
    enabled: true,
    allocation: 0,
    currentExposure: 0,
    pnl: 0,
    trades: 0,
    winRate: 50,
    signals: [],
  };

  abstract processEvent(event: MarketEvent, portfolioValue: number): TradeAction[];
  abstract getStatus(): string;
}
