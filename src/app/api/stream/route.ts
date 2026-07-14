import { getSession } from '@/lib/auth';
import { subscribeUser } from '@/lib/realtime';

// SSE-поток событий пользователя (живая личка/уведомления). Самодостаточен для
// nginx: X-Accel-Buffering=no отключает буферизацию этого ответа, heartbeat
// каждые 25с (< дефолтный proxy_read_timeout 60с) держит соединение живым —
// правки прод-nginx не требуется.
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return new Response('unauthorized', { status: 401 });

  const encoder = new TextEncoder();
  let unsub: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // контроллер закрыт (клиент отключился) — гасим ресурсы
          if (heartbeat) clearInterval(heartbeat);
          unsub();
        }
      };
      send(': connected\n\n');
      unsub = subscribeUser(session.userId, (e) => {
        send(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
      });
      heartbeat = setInterval(() => send(': ping\n\n'), 25000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsub();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
