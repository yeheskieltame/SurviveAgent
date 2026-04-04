/**
 * Executor Base - Handles trade action execution
 * In production: connects to real exchanges
 * In simulation: tracks paper positions with real prices
 */
import { TradeAction } from '../strategies/base';

export interface ExecutionResult {
  actionId: string;
  success: boolean;
  executedPrice?: number;
  executedAmount?: number;
  txHash?: string;
  fee?: number;
  error?: string;
  timestamp: Date;
}

export interface Position {
  id: string;
  strategy: string;
  platform: string;
  asset: string;
  side: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  amount: number;
  leverage: number;
  pnl: number;
  pnlPercent: number;
  stopLoss?: number;
  takeProfit?: number;
  openTime: Date;
}

export abstract class BaseExecutor {
  abstract name: string;
  abstract platform: string;

  // Mode: 'paper' = simulation with real prices, 'live' = real execution
  protected mode: 'paper' | 'live' = 'paper';
  protected positions: Map<string, Position> = new Map();

  setMode(mode: 'paper' | 'live') {
    this.mode = mode;
  }

  abstract execute(action: TradeAction): Promise<ExecutionResult>;
  abstract updatePositions(prices: Map<string, number>): void;

  getPositions(): Position[] {
    return [...this.positions.values()];
  }

  getTotalPnL(): number {
    return [...this.positions.values()].reduce((sum, p) => sum + p.pnl, 0);
  }

  getTotalExposure(): number {
    return [...this.positions.values()].reduce((sum, p) => sum + p.amount, 0);
  }
}
