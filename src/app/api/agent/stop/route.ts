import { NextResponse } from 'next/server';
import { serverEngine } from '@/lib/server/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  serverEngine.stop();
  return NextResponse.json({ success: true, message: 'Agent stopped' });
}
