/**
 * DeFi Yield Collector
 * Source: DeFi Llama Yields API
 */
import { BaseCollector } from './base';
import { v4 as uuidv4 } from 'uuid';

export interface YieldOpportunity {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase: number;
  apyReward: number;
  stablecoin: boolean;
  il7d: number | null;   // impermanent loss 7d
  exposure: 'single' | 'multi';
}

export class YieldCollector extends BaseCollector {
  name = 'YieldCollector';
  private timer: NodeJS.Timeout | null = null;
  private opportunities: YieldOpportunity[] = [];

  async start() {
    this.running = true;
    await this.fetchYields();
    this.timer = setInterval(() => this.fetchYields(), 300_000); // every 5 min
  }

  private async fetchYields() {
    if (!this.running) return;

    try {
      const res = await fetch('https://yields.llama.fi/pools');
      if (!res.ok) return;

      const data = await res.json();
      const pools = (data.data || [])
        .filter((p: Record<string, unknown>) => {
          const tvl = p.tvlUsd as number;
          const apy = p.apy as number;
          const chain = p.chain as string;
          return (
            tvl > 500_000 &&
            apy > 0 && apy < 500 &&
            ['Ethereum', 'Arbitrum', 'Optimism', 'Base', 'Solana', 'Polygon', 'BSC', 'Avalanche'].includes(chain)
          );
        })
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (b.apy as number) - (a.apy as number))
        .slice(0, 50)
        .map((p: Record<string, unknown>): YieldOpportunity => ({
          pool: p.pool as string,
          chain: p.chain as string,
          project: p.project as string,
          symbol: p.symbol as string,
          tvlUsd: p.tvlUsd as number,
          apy: p.apy as number,
          apyBase: (p.apyBase as number) || 0,
          apyReward: (p.apyReward as number) || 0,
          stablecoin: (p.stablecoin as boolean) || false,
          il7d: (p.il7d as number) || null,
          exposure: (p.exposure as string) === 'single' ? 'single' : 'multi',
        }));

      this.opportunities = pools;

      // Separate stable and non-stable
      const stableYields = pools.filter((p: YieldOpportunity) => p.stablecoin);
      const topYields = pools.slice(0, 10);

      this.emit({
        id: uuidv4(),
        type: 'yield_change',
        source: 'defillama',
        timestamp: new Date(),
        data: {
          topYields,
          stableYields: stableYields.slice(0, 5),
          bestStableAPY: stableYields[0]?.apy || 0,
          bestOverallAPY: topYields[0]?.apy || 0,
          totalPools: pools.length,
        },
        priority: 'low',
      });
    } catch (err) {
      console.error('[YieldCollector] Fetch failed:', err);
    }
  }

  getOpportunities(): YieldOpportunity[] {
    return [...this.opportunities];
  }

  getBestStableYield(): YieldOpportunity | null {
    return this.opportunities.find(p => p.stablecoin) || null;
  }

  stop() {
    super.stop();
    if (this.timer) clearInterval(this.timer);
  }
}
