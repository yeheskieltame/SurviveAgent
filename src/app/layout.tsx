import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SurviveAgent | Autonomous Web3 Trading System',
  description: 'An AI-powered autonomous agent that survives and multiplies USDC across Web3 strategies including futures, Polymarket, memecoins, airdrops, arbitrage, and DeFi yield.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-agent-bg text-white antialiased">
        {children}
      </body>
    </html>
  );
}
