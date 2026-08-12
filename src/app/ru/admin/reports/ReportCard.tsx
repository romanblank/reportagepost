'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
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
    const res = await apiFetch(`/api/admin/reports/${id}`, { method: 'PATCH', body: { status, resolution: note.trim() || undefined } });
    setBusy(false);
    if (res?.ok) { router.refresh(); return; }
    setError(ru.ui.toastError);
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded-sm bg-surface-2 px-2 py-0.5 t-fine font-medium">
          {ru.adminReports.reasonLabel[reason] ?? reason}
        </span>
        <span className="t-small">{ru.adminReports.targetLabel[targetType] ?? targetType}</span>
        <code className="t-fine muted">{targetId}</code>
        <span className="ml-auto t-fine muted">{createdAt}</span>
      </div>

      <p className="mt-2 t-small muted">
        {ru.adminReports.from} {reporter}
        {contactEmail && ` · ${contactEmail}`}
      </p>
      {comment && <p className="mt-2 whitespace-pre-wrap t-small">{comment}</p>}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={ru.adminReports.resolutionPlaceholder}
        className="input mt-3 t-small"
        maxLength={500}
      />
      {error && <p role="alert" className="mt-1 t-small text-danger">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => resolve('RESOLVED')}
          className="btn btn-accent px-3 py-1.5 t-small">
          {ru.adminReports.resolve}
        </button>
        <button type="button" disabled={busy} onClick={() => resolve('DISMISSED')}
          className="btn btn-outline px-3 py-1.5 t-small">
          {ru.adminReports.dismiss}
        </button>
      </div>
    </div>
  );
}
