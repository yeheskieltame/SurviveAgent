import { NextResponse } from 'next/server';
import { getAllTrades, getTradesBySession } from '@/lib/db/database';
import { serverEngine } from '@/lib/server/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session') || serverEngine.getSessionId();
  const limit = parseInt(searchParams.get('limit') || '100');

  try {
    const trades = sessionId
      ? getTradesBySession(sessionId)
      : getAllTrades(limit);

    return NextResponse.json({ success: true, trades, count: trades.length });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'DB error' },
      { status: 500 }
    );
  }
}
