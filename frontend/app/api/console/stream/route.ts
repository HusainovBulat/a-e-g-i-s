import { subscribeConsole } from '../../../../server/mock/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try { controller.close(); } catch { /* stream already closed */ }
      };
      unsubscribe = subscribeConsole(frame => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      });
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 15000);
      request.signal.addEventListener('abort', close, { once: true });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
