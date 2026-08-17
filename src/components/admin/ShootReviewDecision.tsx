'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';
import { useToast } from '@/components/ui/Toast';

export function ShootReviewDecision({ shootId }: { shootId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function decide(action: 'approve' | 'reject') {
    setBusy(true);
    const res = await apiFetch('/api/admin/shoots', { body: { shootId, action } });
    setBusy(false);
    if (!res.ok) return toast(ru.ui.toastError, 'danger');
    router.refresh();
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <button type="button" disabled={busy} onClick={() => decide('approve')} className="btn btn-primary btn-sm">
        {ru.adminShoots.approve}
      </button>
      <button type="button" disabled={busy} onClick={() => decide('reject')} className="btn btn-outline btn-sm">
        {ru.adminShoots.reject}
      </button>
    </div>
  );
}
