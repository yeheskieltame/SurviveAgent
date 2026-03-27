import { NextResponse } from 'next/server';
import { serverEngine } from '@/lib/server/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const state = serverEngine.getState();
  return NextResponse.json({
    running: serverEngine.isRunning(),
    claudeConnected: serverEngine.isClaudeConnected(),
    state,
  });
}
