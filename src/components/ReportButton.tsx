'use client';

import { useState } from 'react';
import { ru } from '@/i18n/ru';

type TargetType = 'USER' | 'PHOTO' | 'STORY' | 'REVIEW' | 'COMMENT' | 'MESSAGE';

// «Пожаловаться» (аудит 2026-07-31, P0): у пользователя не было способа
// сообщить о нарушении. Доступно и гостю — жалоба правообладателя на украденный
// кадр приходит от человека без аккаунта (тогда просим контакт для ответа).
export function ReportButton({
  targetType,
  targetId,
  authed,
  className = '',
}: {
  targetType: TargetType;
  targetId: string;
  authed: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('SPAM');
  const [comment, setComment] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType,
        targetId,
        reason,
        comment: comment.trim() || undefined,
        contactEmail: !authed && email.trim() ? email.trim() : undefined,
      }),
    }).catch(() => null);
    setBusy(false);
    if (res?.status === 201) { setSent(true); return; }
    if (res?.status === 429) { setError(ru.report.tooMany); return; }
    setError(ru.ui.toastError);
  }

  if (sent) {
    return <p className={`text-xs text-recognition ${className}`}>{ru.report.sent}</p>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className={`text-xs text-muted underline transition hover:text-accent ${className}`}>
        {ru.report.cta}
      </button>
    );
  }

  return (
    <div className={`card mt-2 p-3 ${className}`}>
      <p className="text-sm font-medium">{ru.report.title}</p>
      <label className="mt-2 block text-xs muted">
        {ru.report.reasonLabel}
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-1 text-sm">
          {Object.entries(ru.report.reasons).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </label>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
        placeholder={ru.report.commentPlaceholder} maxLength={2000} className="input mt-2 text-sm" />
      {!authed && (
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
          placeholder={ru.report.emailPlaceholder} className="input mt-2 text-sm" />
      )}
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={submit}
          className="btn btn-accent px-3 py-1.5 text-sm">{ru.report.submit}</button>
        <button type="button" onClick={() => setOpen(false)}
          className="btn btn-outline px-3 py-1.5 text-sm">{ru.ui.cancel}</button>
      </div>
    </div>
  );
}
