/**
 * Paper Trading Executor
 * Simulates trades with REAL market prices for accurate backtesting
 * This executor tracks positions, PnL, and generates execution reports
 * Same interface as live executors — easy to swap in production
 */
import { v4 as uuidv4 } from 'uuid';
import { TradeAction } from '../strategies/base';
import { BaseExecutor, ExecutionResult, Position } from './base';

export class PaperExecutor extends BaseExecutor {
  name = 'PaperExecutor';
  platform = 'paper';
  private executionLog: ExecutionResult[] = [];
  private balance: number;

  constructor(initialBalance: number) {
    super();
    this.balance = initialBalance;
    this.mode = 'paper';
  }

  async execute(action: TradeAction): Promise<ExecutionResult> {
    const timestamp = new Date();

    // No-action signals don't need execution
    if (action.type === 'no_action') {
      return { actionId: action.id, success: true, timestamp };
    }

    // Simulate slippage (0.05-0.2%)
    const slippage = 1 + (Math.random() * 0.002 - 0.001);
    const executedPrice = (action.price || 0) * slippage;

    // Simulate fee (0.05% taker fee typical for perps)
    const fee = action.amount * 0.0005;

    switch (action.type) {
      case 'open_long':
      case 'open_short': {
        if (action.amount > this.balance) {
          return { actionId: action.id, success: false, error: 'Insufficient balance', timestamp };
        }

        const position: Position = {
          id: uuidv4(),
          strategy: action.strategyName,
          platform: action.platform,
          asset: action.asset,
          side: action.type === 'open_long' ? 'long' : 'short',
          entryPrice: executedPrice || action.price || 0,
          currentPrice: executedPrice || action.price || 0,
          amount: action.amount,
          leverage: action.leverage || 1,
          pnl: -fee,
          pnlPercent: 0,
          stopLoss: action.stopLoss,
          takeProfit: action.takeProfit,
          openTime: timestamp,
        };

        this.positions.set(position.id, position);
        this.balance -= action.amount / (action.leverage || 1); // margin used

        const result: ExecutionResult = {
          actionId: action.id,
          success: true,
          executedPrice,
          executedAmount: action.amount,
          txHash: `paper_${uuidv4().slice(0, 8)}`,
          fee,
          timestamp,
        };
        this.executionLog.push(result);
        return result;
      }

      case 'close_position': {
        // Find and close matching position
        for (const [id, pos] of this.positions) {
          if (pos.asset === action.asset) {
            this.balance += pos.amount / (pos.leverage || 1) + pos.pnl - fee;
            this.positions.delete(id);
            return { actionId: action.id, success: true, executedAmount: pos.amount, fee, timestamp };
          }
        }
        return { actionId: action.id, success: false, error: 'No matching position', timestamp };
      }

      case 'stake':
      case 'buy_prediction':
      case 'swap':
      case 'snipe_token': {
        if (action.amount > this.balance) {
          return { actionId: action.id, success: false, error: 'Insufficient balance', timestamp };
        }

        const position: Position = {
          id: uuidv4(),
          strategy: action.strategyName,
          platform: action.platform,
          asset: action.asset,
          side: 'long',
          entryPrice: action.price || 1,
          currentPrice: action.price || 1,
          amount: action.amount,
          leverage: 1,
          pnl: -fee,
          pnlPercent: 0,
          openTime: timestamp,
        };

        this.positions.set(position.id, position);
        this.balance -= action.amount;

        return {
          actionId: action.id,
          success: true,
          executedPrice: action.price,
          executedAmount: action.amount,
          txHash: `paper_${uuidv4().slice(0, 8)}`,
          fee,
          timestamp,
        };
      }

      case 'unstake':
      case 'sell_prediction':
      case 'claim': {
        this.balance += action.amount;
        return { actionId: action.id, success: true, executedAmount: action.amount, fee: 0, timestamp };
      }

      default:
        return { actionId: action.id, success: true, timestamp };
    }
  }

  updatePositions(prices: Map<string, number>) {
    for (const position of this.positions.values()) {
      // Extract symbol from asset (e.g., "BTC/USD" → "BTC")
      const symbol = position.asset.split('/')[0].toUpperCase();
      const currentPrice = prices.get(symbol);

      if (currentPrice && position.entryPrice > 0) {
        position.currentPrice = currentPrice;
        const priceChange = (currentPrice - position.entryPrice) / position.entryPrice;
        const direction = position.side === 'long' ? 1 : -1;
        position.pnl = position.amount * priceChange * direction * position.leverage;
        position.pnlPercent = priceChange * direction * position.leverage * 100;

        // Check stop-loss
        if (position.stopLoss) {
          const hitStop = position.side === 'long'
            ? currentPrice <= position.stopLoss
            : currentPrice >= position.stopLoss;

          if (hitStop) {
            this.balance += position.amount / position.leverage + position.pnl;
            this.positions.delete(position.id);
          }
        }

        // Check take-profit
        if (position.takeProfit) {
          const hitTP = position.side === 'long'
            ? currentPrice >= position.takeProfit
            : currentPrice <= position.takeProfit;

          if (hitTP) {
            this.balance += position.amount / position.leverage + position.pnl;
            this.positions.delete(position.id);
          }
        }
      }
    }
  }

  getBalance(): number {
    return this.balance;
  }

  getEquity(): number {
    return this.balance + this.getTotalPnL();
  }

  getExecutionLog(): ExecutionResult[] {
    return [...this.executionLog];
  }
}
