/**
 * Risk Management System
 * - Kelly Criterion position sizing
 * - Maximum drawdown protection
 * - Correlation-based exposure limits
 * - Dynamic stop-loss management
 */

export interface PositionSizeResult {
  positionSize: number;      // USD amount
  portfolioPercent: number;  // % of total portfolio
  leverage: number;          // effective leverage
  stopLoss: number;          // stop-loss price
  takeProfit: number;        // take-profit price
  riskRewardRatio: number;
  maxLoss: number;           // max USD loss
  kellyFraction: number;     // Kelly % recommendation
}

export interface RiskLimits {
  maxPositionSize: number;     // max % per single position
  maxTotalExposure: number;    // max % total market exposure
  maxDrawdown: number;         // max drawdown before full stop
  maxCorrelatedExposure: number; // max % in correlated assets
  maxSingleTradeRisk: number;  // max % risk per trade
}

const DEFAULT_LIMITS: RiskLimits = {
  maxPositionSize: 15,       // 15% max per position
  maxTotalExposure: 80,      // 80% max market exposure (20% cash)
  maxDrawdown: 20,           // 20% max drawdown triggers full stop
  maxCorrelatedExposure: 30, // 30% max in correlated positions
  maxSingleTradeRisk: 3,     // 3% max risk per single trade
};

export class RiskManager {
  private limits: RiskLimits;
  private tradeHistory: { pnlPercent: number; timestamp: number }[] = [];
  private peakBalance: number;
  private currentDrawdown: number = 0;

  constructor(
    private portfolioValue: number,
    limits?: Partial<RiskLimits>
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.peakBalance = portfolioValue;
  }

  updatePortfolio(newValue: number) {
    this.portfolioValue = newValue;
    if (newValue > this.peakBalance) {
      this.peakBalance = newValue;
    }
    this.currentDrawdown = ((this.peakBalance - newValue) / this.peakBalance) * 100;
  }

  /**
   * Kelly Criterion: f* = (p * b - q) / b
   * p = win probability, q = 1-p, b = win/loss ratio
   * We use half-Kelly for safety
   */
  kellyFraction(winRate: number, avgWin: number, avgLoss: number): number {
    if (avgLoss === 0 || winRate <= 0 || winRate >= 1) return 0;

    const p = winRate;
    const q = 1 - p;
    const b = avgWin / avgLoss;

    const fullKelly = (p * b - q) / b;
    const halfKelly = fullKelly / 2; // half-Kelly for safety

    // Clamp between 0 and max position size
    return Math.max(0, Math.min(halfKelly * 100, this.limits.maxPositionSize));
  }

  /**
   * Calculate optimal position size for a trade
   */
  calculatePositionSize(params: {
    entryPrice: number;
    stopLossPrice: number;
    takeProfitPrice: number;
    winProbability?: number;
    side: 'long' | 'short';
  }): PositionSizeResult {
    const { entryPrice, stopLossPrice, takeProfitPrice, winProbability = 0.55, side } = params;

    // Risk per unit
    const riskPerUnit = side === 'long'
      ? (entryPrice - stopLossPrice) / entryPrice
      : (stopLossPrice - entryPrice) / entryPrice;

    const rewardPerUnit = side === 'long'
      ? (takeProfitPrice - entryPrice) / entryPrice
      : (entryPrice - takeProfitPrice) / entryPrice;

    const riskRewardRatio = riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : 0;

    // Kelly-based sizing
    const kellyPct = this.kellyFraction(winProbability, rewardPerUnit, riskPerUnit);

    // Apply risk limits
    const maxRiskAmount = this.portfolioValue * (this.limits.maxSingleTradeRisk / 100);
    const kellyAmount = this.portfolioValue * (kellyPct / 100);
    const maxPositionAmount = this.portfolioValue * (this.limits.maxPositionSize / 100);

    // Position size = min(kelly, max_risk / risk_per_unit, max_position)
    const riskBasedSize = riskPerUnit > 0 ? maxRiskAmount / riskPerUnit : 0;
    const positionSize = Math.min(kellyAmount, riskBasedSize, maxPositionAmount);

    // Check drawdown circuit breaker
    if (this.currentDrawdown >= this.limits.maxDrawdown) {
      return {
        positionSize: 0,
        portfolioPercent: 0,
        leverage: 0,
        stopLoss: stopLossPrice,
        takeProfit: takeProfitPrice,
        riskRewardRatio,
        maxLoss: 0,
        kellyFraction: 0,
      };
    }

    return {
      positionSize: Math.round(positionSize * 100) / 100,
      portfolioPercent: (positionSize / this.portfolioValue) * 100,
      leverage: positionSize / this.portfolioValue,
      stopLoss: stopLossPrice,
      takeProfit: takeProfitPrice,
      riskRewardRatio,
      maxLoss: positionSize * riskPerUnit,
      kellyFraction: kellyPct,
    };
  }

  /**
   * Check if a new trade is allowed given current risk parameters
   */
  canTrade(params: {
    currentExposure: number; // total current exposure in USD
    newPositionSize: number;
    correlatedExposure?: number; // exposure to correlated assets
  }): { allowed: boolean; reason: string } {
    // Drawdown circuit breaker
    if (this.currentDrawdown >= this.limits.maxDrawdown) {
      return { allowed: false, reason: `Max drawdown hit (${this.currentDrawdown.toFixed(1)}% >= ${this.limits.maxDrawdown}%). All trading halted.` };
    }

    // Total exposure check
    const totalExposure = ((params.currentExposure + params.newPositionSize) / this.portfolioValue) * 100;
    if (totalExposure > this.limits.maxTotalExposure) {
      return { allowed: false, reason: `Total exposure would be ${totalExposure.toFixed(1)}% (max: ${this.limits.maxTotalExposure}%)` };
    }

    // Single position check
    const positionPct = (params.newPositionSize / this.portfolioValue) * 100;
    if (positionPct > this.limits.maxPositionSize) {
      return { allowed: false, reason: `Position size ${positionPct.toFixed(1)}% exceeds limit (${this.limits.maxPositionSize}%)` };
    }

    // Correlation check
    if (params.correlatedExposure) {
      const corrPct = ((params.correlatedExposure + params.newPositionSize) / this.portfolioValue) * 100;
      if (corrPct > this.limits.maxCorrelatedExposure) {
        return { allowed: false, reason: `Correlated exposure ${corrPct.toFixed(1)}% exceeds limit (${this.limits.maxCorrelatedExposure}%)` };
      }
    }

    return { allowed: true, reason: 'Trade approved by risk manager' };
  }

  recordTrade(pnlPercent: number) {
    this.tradeHistory.push({ pnlPercent, timestamp: Date.now() });
    // Keep last 100 trades
    if (this.tradeHistory.length > 100) {
      this.tradeHistory = this.tradeHistory.slice(-100);
    }
  }

  getStats() {
    if (this.tradeHistory.length === 0) {
      return { winRate: 0.5, avgWin: 0, avgLoss: 0, sharpeRatio: 0, maxDrawdown: 0, trades: 0 };
    }

    const wins = this.tradeHistory.filter(t => t.pnlPercent > 0);
    const losses = this.tradeHistory.filter(t => t.pnlPercent <= 0);

    const winRate = wins.length / this.tradeHistory.length;
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length) : 0;

    const mean = this.tradeHistory.reduce((s, t) => s + t.pnlPercent, 0) / this.tradeHistory.length;
    const variance = this.tradeHistory.reduce((s, t) => s + (t.pnlPercent - mean) ** 2, 0) / this.tradeHistory.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (mean / stdDev) * Math.sqrt(365) : 0;

    return {
      winRate,
      avgWin,
      avgLoss,
      sharpeRatio,
      maxDrawdown: this.currentDrawdown,
      trades: this.tradeHistory.length,
    };
  }

  getCurrentDrawdown(): number {
    return this.currentDrawdown;
  }

  getLimits(): RiskLimits {
    return { ...this.limits };
  }
}
