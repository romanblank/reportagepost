'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { MAX_LENGTH } from '@/lib/text-moderation-rules';
import { ru } from '@/i18n/ru';

type Outcome = { status: string; slug: string; reason?: string; left: number };

/** Подача статьи в журнал. Статья всегда идёт человеку — это редакционный раздел. */
export function ArticleForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [lead, setLead] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Outcome | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<Outcome>('/api/articles', { body: { title, lead, body } });
      if (!res.ok) {
        setError(ru.articles.errors[res.error] ?? res.error);
        return;
      }
      setSent(res.data);
      setTitle('');
      setLead('');
      setBody('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="mt-6 rounded-media border border-line bg-surface-2 px-4 py-3 t-small">
        {sent.status === 'REJECTED'
          ? `${ru.moderation.reasons[sent.reason ?? 'off_topic']} ${ru.moderation.fix[sent.reason ?? 'off_topic']}`
          : ru.articles.sent}
      </p>
    );
  }

  return (
    <div className="mt-6 grid gap-3">
      <label className="grid gap-1">
        <span className="t-caption muted">{ru.articles.fieldTitle}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} className="input" />
      </label>
      <label className="grid gap-1">
        <span className="t-fine muted">{ru.articles.fieldLead}</span>
        <textarea value={lead} onChange={(e) => setLead(e.target.value)} maxLength={400} rows={3} className="input" />
      </label>
      <label className="grid gap-1">
        <span className="t-caption muted">{ru.articles.fieldBody}</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_LENGTH.article}
          rows={14}
          className="input"
        />
      </label>
      {error ? <p className="t-caption text-danger">{error}</p> : null}
      <button
        type="button"
        onClick={submit}
        disabled={busy || title.trim().length < 10 || lead.trim().length < 40 || body.trim().length < 400}
        className="btn btn-primary justify-self-start"
      >
        {ru.articles.send}
      </button>
      <p className="t-fine muted">{ru.articles.reviewNote}</p>
    </div>
  );
}
