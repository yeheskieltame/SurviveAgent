import { NextResponse } from 'next/server';
import { serverEngine } from '@/lib/server/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const initialBalance = body.initialBalance || 1000;

    const result = await serverEngine.start(initialBalance);

    return NextResponse.json({
      success: true,
      claudeAvailable: result.claudeAvailable,
      message: `Agent started with ${initialBalance} USDC. Claude CLI: ${result.claudeAvailable ? 'active' : 'unavailable'}`,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
