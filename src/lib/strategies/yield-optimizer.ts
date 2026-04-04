/**
 * DeFi Yield Optimization Strategy
 * Auto-rotates between best yield opportunities
 * Conservative, consistent returns — the "savings account"
 */
import { v4 as uuidv4 } from 'uuid';
import { MarketEvent } from '../collectors/base';
import { BaseStrategy, TradeAction } from './base';
import { YieldOpportunity } from '../collectors/yield-collector';

const MIN_APY = 3;            // minimum 3% APY to deploy
const MIN_TVL = 5_000_000;    // minimum $5M TVL for safety
const ROTATION_THRESHOLD = 2; // rotate if new APY is 2% higher

export class YieldOptimizerStrategy extends BaseStrategy {
  name = 'DeFi Yield Optimizer';
  platform = 'aave' as const;

  private currentPosition: { pool: string; project: string; apy: number; chain: string } | null = null;
  private lastRotation: number = 0;
  private rotationCooldown = 3600_000; // 1 hour minimum between rotations

  processEvent(event: MarketEvent, portfolioValue: number): TradeAction[] {
    if (event.type !== 'yield_change') return [];

    const actions: TradeAction[] = [];
    const allocation = portfolioValue * (this.state.allocation / 100);
    const topYields = event.data.topYields as YieldOpportunity[];
    const stableYields = event.data.stableYields as YieldOpportunity[];

    if (!topYields || topYields.length === 0) return actions;

    // Prioritize stable yields for safety
    const candidates = stableYields && stableYields.length > 0 ? stableYields : topYields;
    const bestYield = candidates
      .filter(y => y.apy > MIN_APY && y.tvlUsd > MIN_TVL)
      .sort((a, b) => {
        // Score: APY * safety_factor
        const safetyA = Math.min(1, a.tvlUsd / 100_000_000); // higher TVL = safer
        const safetyB = Math.min(1, b.tvlUsd / 100_000_000);
        return (b.apy * safetyB) - (a.apy * safetyA);
      })[0];

    if (!bestYield) return actions;

    const now = Date.now();

    // Deploy initial position
    if (!this.currentPosition) {
      actions.push({
        id: uuidv4(),
        strategyName: this.name,
        type: 'stake',
        platform: 'aave',
        asset: bestYield.symbol,
        amount: allocation * 0.8, // deploy 80% of allocation
        confidence: 85,
        urgency: 'medium',
        reasoning: `Deploying to ${bestYield.project} (${bestYield.chain}): ${bestYield.symbol} at ${bestYield.apy.toFixed(2)}% APY. TVL: $${(bestYield.tvlUsd / 1e6).toFixed(1)}M.`,
        metadata: {
          pool: bestYield.pool,
          project: bestYield.project,
          chain: bestYield.chain,
          apy: bestYield.apy,
          tvl: bestYield.tvlUsd,
        },
        timestamp: new Date(),
      });
      this.currentPosition = {
        pool: bestYield.pool,
        project: bestYield.project,
        apy: bestYield.apy,
        chain: bestYield.chain,
      };
      this.lastRotation = now;
      return actions;
    }

    // Rotate if significantly better yield available (with cooldown)
    if (
      now - this.lastRotation > this.rotationCooldown &&
      bestYield.apy > this.currentPosition.apy + ROTATION_THRESHOLD &&
      bestYield.pool !== this.currentPosition.pool
    ) {
      // Unstake from current
      actions.push({
        id: uuidv4(),
        strategyName: this.name,
        type: 'unstake',
        platform: 'aave',
        asset: 'USDC',
        amount: allocation * 0.8,
        confidence: 75,
        urgency: 'low',
        reasoning: `Rotating out of ${this.currentPosition.project} (${this.currentPosition.apy.toFixed(2)}% APY) → ${bestYield.project} (${bestYield.apy.toFixed(2)}% APY). +${(bestYield.apy - this.currentPosition.apy).toFixed(2)}% improvement.`,
        timestamp: new Date(),
      });

      // Stake in new
      actions.push({
        id: uuidv4(),
        strategyName: this.name,
        type: 'stake',
        platform: 'aave',
        asset: bestYield.symbol,
        amount: allocation * 0.8,
        confidence: 80,
        urgency: 'medium',
        reasoning: `Deploying to ${bestYield.project} (${bestYield.chain}): ${bestYield.apy.toFixed(2)}% APY.`,
        metadata: { pool: bestYield.pool, project: bestYield.project, apy: bestYield.apy },
        timestamp: new Date(),
      });

      this.currentPosition = {
        pool: bestYield.pool,
        project: bestYield.project,
        apy: bestYield.apy,
        chain: bestYield.chain,
      };
      this.lastRotation = now;
    }

    return actions;
  }

  getStatus(): string {
    if (!this.currentPosition) return 'No position deployed yet';
    return `Staked in ${this.currentPosition.project} (${this.currentPosition.chain}) at ${this.currentPosition.apy.toFixed(2)}% APY`;
  }
}
