'use client';

import { useState } from 'react';
import { ru } from '@/i18n/ru';
import { useRouter } from 'next/navigation';

// Карточка жалобы в очереди админа: разобрать (принять меры) либо отклонить.
export function ReportCard({
  id, targetType, targetId, reason, comment, contactEmail, createdAt, reporter,
}: {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  comment: string | null;
  contactEmail: string | null;
  createdAt: string;
  reporter: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function resolve(status: 'RESOLVED' | 'DISMISSED') {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, resolution: note.trim() || undefined }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) { router.refresh(); return; }
    setError(ru.ui.toastError);
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded-sm bg-surface-2 px-2 py-0.5 text-xs font-medium">
          {ru.adminReports.reasonLabel[reason] ?? reason}
        </span>
        <span className="text-sm">{ru.adminReports.targetLabel[targetType] ?? targetType}</span>
        <code className="text-xs muted">{targetId}</code>
        <span className="ml-auto text-xs muted">{createdAt}</span>
      </div>

      <p className="mt-2 text-sm muted">
        {ru.adminReports.from} {reporter}
        {contactEmail && ` · ${contactEmail}`}
      </p>
      {comment && <p className="mt-2 whitespace-pre-wrap text-sm">{comment}</p>}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={ru.adminReports.resolutionPlaceholder}
        className="input mt-3 text-sm"
        maxLength={500}
      />
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => resolve('RESOLVED')}
          className="btn btn-accent px-3 py-1.5 text-sm">
          {ru.adminReports.resolve}
        </button>
        <button type="button" disabled={busy} onClick={() => resolve('DISMISSED')}
          className="btn btn-outline px-3 py-1.5 text-sm">
          {ru.adminReports.dismiss}
        </button>
      </div>
    </div>
  );
}
