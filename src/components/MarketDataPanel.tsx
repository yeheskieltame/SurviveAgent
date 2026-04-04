'use client';

import React, { useEffect, useState } from 'react';

interface PriceData {
  symbol: string;
  price: number;
  change: number;
}

export function MarketDataPanel() {
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [fearGreed, setFearGreed] = useState<number>(50);
  const [fearLabel, setFearLabel] = useState('Neutral');

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,arbitrum,dogecoin,pepe&vs_currencies=usd&include_24hr_change=true'
        );
        if (res.ok) {
          const data = await res.json();
          const mapped: PriceData[] = [
            { symbol: 'BTC', price: data.bitcoin?.usd || 0, change: data.bitcoin?.usd_24h_change || 0 },
            { symbol: 'ETH', price: data.ethereum?.usd || 0, change: data.ethereum?.usd_24h_change || 0 },
            { symbol: 'SOL', price: data.solana?.usd || 0, change: data.solana?.usd_24h_change || 0 },
            { symbol: 'ARB', price: data.arbitrum?.usd || 0, change: data.arbitrum?.usd_24h_change || 0 },
            { symbol: 'DOGE', price: data.dogecoin?.usd || 0, change: data.dogecoin?.usd_24h_change || 0 },
            { symbol: 'PEPE', price: data.pepe?.usd || 0, change: data.pepe?.usd_24h_change || 0 },
          ];
          setPrices(mapped);
        }
      } catch {}

      try {
        const fgRes = await fetch('https://api.alternative.me/fng/?limit=1');
        if (fgRes.ok) {
          const fgData = await fgRes.json();
          if (fgData.data?.[0]) {
            setFearGreed(parseInt(fgData.data[0].value));
            setFearLabel(fgData.data[0].value_classification);
          }
        }
      } catch {}
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, []);

  const fgColor = fearGreed < 30 ? 'text-agent-red' : fearGreed > 70 ? 'text-agent-green' : 'text-agent-yellow';

  return (
    <div className="bg-agent-card border border-agent-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-400 flex items-center gap-2">
          <span>📊</span> Live Market Data
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">Fear & Greed:</span>
          <span className={`text-sm font-bold font-mono ${fgColor}`}>{fearGreed}</span>
          <span className="text-[10px] text-gray-500">{fearLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {prices.map(p => (
          <div key={p.symbol} className="bg-agent-bg/50 rounded-lg p-2 text-center">
            <div className="text-[10px] text-gray-500">{p.symbol}</div>
            <div className="text-xs font-mono text-white">
              ${p.price > 1000 ? p.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : p.price < 0.01 ? p.price.toFixed(6) : p.price.toFixed(2)}
            </div>
            <div className={`text-[10px] font-mono ${p.change >= 0 ? 'text-agent-green' : 'text-agent-red'}`}>
              {p.change >= 0 ? '+' : ''}{p.change.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
