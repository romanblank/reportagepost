'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';

// Время сообщения (локаль ru, ЧЧ:ММ). На клиенте — часовой пояс пользователя.
function msgTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

interface Msg {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export function ThreadClient({ peerId, selfId, initial }: { peerId: string; selfId: string; initial: Msg[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Автоскролл к последнему сообщению при загрузке и новых сообщениях.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  // Синхронизация со свежими данными сервера после router.refresh() (аудит P1:
  // без этого входящие не появлялись). Официальный react-паттерн «правка стейта
  // при смене пропа» — во время рендера, не в эффекте (react-hooks/set-state-in-effect).
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setMessages(initial);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = String(new FormData(form).get('body') ?? '').trim();
    if (!body) return;
    setPending(true);
    setError(null);
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId: peerId, body }),
    }).catch(() => null);
    setPending(false);
    if (res?.status === 201) {
      form.reset();
      setMessages((prev) => [
        ...prev,
        { id: `tmp-${Date.now()}`, senderId: selfId, body, createdAt: new Date().toISOString() },
      ]);
      router.refresh();
      return;
    }
    // Раньше при не-201 не происходило НИЧЕГО (аудит P0: молчаливый провал)
    setError(res?.status === 429 ? ru.messages.errorRate : ru.messages.errorSend);
  }

  return (
    <div className="mt-4 flex flex-1 flex-col">
      {messages.length === 0 ? (
        <p className="py-10 text-center text-sm muted">{ru.messages.emptyThread}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {messages.map((m) => {
            const mine = m.senderId === selfId;
            return (
              <li key={m.id} className={`flex max-w-[85%] flex-col ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
                <span className={`rounded-xl border px-3 py-2 text-sm ${mine ? 'bg-foreground text-background' : ''}`}>
                  {m.body}
                </span>
                <time className="mt-0.5 px-1 text-[11px] text-muted-2" dateTime={m.createdAt}>{msgTime(m.createdAt)}</time>
              </li>
            );
          })}
        </ul>
      )}
      <div ref={bottomRef} />
      {error && <p role="alert" className="mt-2 text-sm text-accent">{error}</p>}
      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <input name="body" required maxLength={4000} placeholder={ru.messages.placeholder}
          className="input flex-1" autoComplete="off" />
        <button type="submit" disabled={pending}
          className="btn btn-accent">
          {ru.messages.send}
        </button>
      </form>
    </div>
  );
}
