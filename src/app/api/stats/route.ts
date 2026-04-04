import { NextResponse } from 'next/server';
import { getOverallStats, getAllSessions, getSessionStats, getSnapshots } from '@/lib/db/database';
import { serverEngine } from '@/lib/server/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session');

  try {
    if (sessionId) {
      const stats = getSessionStats(sessionId);
      const snapshots = getSnapshots(sessionId);
      return NextResponse.json({ success: true, stats, snapshots });
    }

    const overall = getOverallStats();
    const sessions = getAllSessions();
    const currentSession = serverEngine.getSessionId();

    return NextResponse.json({
      success: true,
      overall,
      sessions,
      currentSession,
      engineRunning: serverEngine.isRunning(),
      claudeConnected: serverEngine.isClaudeConnected(),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'DB error' },
      { status: 500 }
    );
  }
}
