'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { programmaticVerdict, MAX_LENGTH } from '@/lib/text-moderation-rules';
import { apiFetch } from '@/lib/api';
import { ModerationNotice } from '@/components/ForumComposer';
import { ru } from '@/i18n/ru';

type Outcome = {
  status: 'PUBLISHED' | 'REJECTED' | 'IN_REVIEW';
  id: string;
  slug?: string;
  reason?: string;
  quote?: string | null;
  violations?: number;
};

/** Новая тема: заголовок и первое сообщение — пустая тема разговор не начинает. */
export function NewThreadForm({
  sections,
  initialSection,
}: {
  sections: { slug: string; label: string }[];
  initialSection: string;
}) {
  const router = useRouter();
  const [sectionSlug, setSectionSlug] = useState(initialSection);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hint = useMemo(() => {
    if (body.trim().length < 20) return null;
    const v = programmaticVerdict({ text: `${title}\n${body}`, kind: 'thread' });
    if (!v || v.action === 'publish') return null;
    return 'reason' in v ? v.reason : null;
  }, [title, body]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<Outcome>('/api/forum/threads', { body: { sectionSlug, title, body } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data.status === 'PUBLISHED' && res.data.slug) {
        router.push(`/ru/forum/${sectionSlug}/${res.data.slug}`);
        return;
      }
      setOutcome(res.data);
    } finally {
      setBusy(false);
    }
  }

  if (outcome) {
    return <ModerationNotice outcome={outcome} body={body} onEdit={() => setOutcome(null)} />;
  }

  return (
    <div className="mt-6 grid gap-3">
      <label className="grid gap-1">
        <span className="t-caption muted">{ru.forum.title}</span>
        <select value={sectionSlug} onChange={(e) => setSectionSlug(e.target.value)} className="input">
          {sections.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
        </select>
      </label>

      <label className="grid gap-1">
        <span className="t-caption muted">{ru.forum.threadTitle}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} className="input" />
      </label>

      <label className="grid gap-1">
        <span className="t-caption muted">{ru.forum.threadBody}</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_LENGTH.thread}
          rows={8}
          className="input"
        />
      </label>

      {hint ? (
        <p className="t-caption text-warning">{ru.moderation.reasons[hint]} {ru.moderation.fix[hint]}</p>
      ) : null}
      {error ? <p className="t-caption text-danger">{error}</p> : null}

      <button
        type="button"
        onClick={submit}
        disabled={busy || title.trim().length < 10 || body.trim().length < 40}
        className="btn btn-primary justify-self-start"
      >
        {ru.forum.send}
      </button>
    </div>
  );
}
