'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { programmaticVerdict, MAX_LENGTH } from '@/lib/text-moderation-rules';
import { apiFetch } from '@/lib/api';
import { LEGAL_ENTITY } from '@/lib/legal-entity';
import { ru } from '@/i18n/ru';

/**
 * Форма сообщения с подсказками во время набора.
 *
 * Самая эффективная модерация — та, которой не понадобилось. Пока человек
 * пишет, интерфейс показывает то же самое, что решит сервер: правила здесь и
 * там — один модуль, поэтому совет не может разойтись с вердиктом.
 *
 * Подсказка НЕ блокирует отправку. Правила ошибаются (номер модели объектива
 * похож на телефон), и запрет по клиентской эвристике превратил бы осечку
 * в непреодолимую стену. Решение остаётся за сервером — здесь только
 * предупреждение.
 */
type Outcome = {
  status: 'PUBLISHED' | 'REJECTED' | 'IN_REVIEW';
  id: string;
  slug?: string;
  reason?: string;
  quote?: string | null;
  violations?: number;
};

export function ForumComposer({
  threadId,
  postId,
  initialBody = '',
  mode = 'reply',
}: {
  threadId?: string;
  /** Для повторной отправки исправленного текста. */
  postId?: string;
  initialBody?: string;
  mode?: 'reply' | 'resubmit';
}) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const area = useRef<HTMLTextAreaElement | null>(null);

  // Цитата приходит от кнопки у сообщения. Через событие, а не через общий
  // стор: две независимые ветки дерева, и заводить ради одной строки контекст
  // на всю страницу — дороже задачи
  useEffect(() => {
    function onQuote(e: Event) {
      const detail = (e as CustomEvent<{ author: string; text: string }>).detail;
      if (!detail) return;
      const quoted = detail.text
        .split('\n')
        .slice(0, 6)
        .map((line) => `> ${line}`)
        .join('\n');
      setBody((prev) => `${prev ? `${prev}\n\n` : ''}${detail.author}:\n${quoted}\n\n`);
      area.current?.focus();
    }
    window.addEventListener('forum:quote', onQuote);
    return () => window.removeEventListener('forum:quote', onQuote);
  }, []);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Живая подсказка: считаем на каждый ввод, но только по программным
  // правилам — модель тут не участвует, она стоит денег и времени
  const hint = useMemo(() => {
    if (body.trim().length < 10) return null;
    const v = programmaticVerdict({ text: body, kind: 'post' });
    if (!v || v.action === 'publish') return null;
    return 'reason' in v ? v.reason : null;
  }, [body]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === 'resubmit' && postId
          ? await apiFetch<Outcome>('/api/forum/resubmit', { body: { postId, body } })
          : await apiFetch<Outcome>('/api/forum/posts', { body: { threadId, body } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const result = res.data;
      setOutcome(result);
      if (result.status === 'PUBLISHED') {
        setBody('');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (outcome && outcome.status !== 'PUBLISHED') {
    return (
      <ModerationNotice outcome={outcome} onEdit={() => setOutcome(null)} />
    );
  }

  return (
    <div className="mt-6">
      <textarea
        ref={area}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_LENGTH.post}
        rows={5}
        className="input w-full"
        placeholder={ru.forum.reply}
      />
      {hint ? (
        <p className="t-caption mt-1 text-warning">{ru.moderation.reasons[hint]} {ru.moderation.fix[hint]}</p>
      ) : null}
      {error ? <p className="t-caption mt-1 text-danger">{error}</p> : null}
      <button
        type="button"
        onClick={send}
        disabled={busy || body.trim().length === 0}
        className="btn btn-primary btn-sm mt-2"
      >
        {mode === 'resubmit' ? ru.forum.resubmit : ru.forum.send}
      </button>
    </div>
  );
}

/**
 * Отказ, с которым можно что-то сделать.
 *
 * Четыре обязательные части: что не так, где именно, как исправить и кнопка
 * отправить снова. Пятая — путь к человеку: если автор считает решение
 * ошибочным, у него должен быть адрес, а не тупик.
 */
export function ModerationNotice({ outcome, onEdit }: { outcome: Outcome; onEdit: () => void }) {
  const reason = outcome.reason ?? 'off_topic';
  return (
    <div className="mt-6 rounded-media border border-warning/40 bg-warning-soft px-4 py-4">
      <p className="t-small">{ru.moderation.rejectedTitle}</p>
      <p className="mt-1 t-small">{ru.moderation.reasons[reason]}</p>
      {outcome.quote ? (
        <p className="t-caption mt-2 muted">
          {ru.moderation.quoteLabel}: <span className="text-ink">«{outcome.quote}»</span>
        </p>
      ) : null}
      <p className="mt-2 t-small">{ru.moderation.fix[reason]}</p>

      {outcome.status === 'IN_REVIEW' ? (
        <p className="t-fine mt-3 muted">{ru.forum.inReview}</p>
      ) : (
        <p className="t-fine mt-3 muted">{ru.forum.resubmitHint}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onEdit} className="btn btn-outline btn-sm">
          {ru.forum.resubmit}
        </button>
        <span className="t-caption muted">
          {ru.forum.supportHint}{' '}
          <a href={`mailto:${LEGAL_ENTITY.email}?subject=${encodeURIComponent(ru.forum.supportSubject)}`} className="underline">
            {ru.forum.supportLink}
          </a>
        </span>
      </div>
      {typeof outcome.violations === 'number' && outcome.violations >= 3 ? (
        <p className="t-fine mt-3 text-warning">{ru.forum.restricted}</p>
      ) : null}
    </div>
  );
}
