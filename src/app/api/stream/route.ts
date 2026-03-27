import { NextResponse } from 'next/server';
import { serverEngine } from '@/lib/server/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)
      );

      // Subscribe to server engine events
      const unsubscribe = serverEngine.addSSEListener((event, data) => {
        try {
          const payload = JSON.stringify({ type: event, ...(data as object) });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // client disconnected
        }
      });

      // Heartbeat every 15 seconds
      const heartbeat = setInterval(() => {
        try {
          const state = serverEngine.getState();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'heartbeat',
              timestamp: Date.now(),
              running: serverEngine.isRunning(),
              claudeConnected: serverEngine.isClaudeConnected(),
              totalBalance: state?.totalBalance || 0,
              totalPnl: state?.totalPnl || 0,
            })}\n\n`)
          );
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 15_000);

      // Cleanup on close
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };

      // Controller close handler
      const originalClose = controller.close.bind(controller);
      controller.close = () => {
        cleanup();
        return originalClose();
      };
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
