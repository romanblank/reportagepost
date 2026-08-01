'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';

// Заказчик отмечает, что съёмка с автором состоялась — честный якорь доверия.
export function ConfirmShootButton({ profileId, initialConfirmed, authed }: {
  profileId: string;
  initialConfirmed: boolean;
  authed: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!authed) {
      router.push('/ru/login');
      return;
    }
    setBusy(true);
    const res = await apiFetch('/api/shoots/confirm', {
      method: 'POST',
      body: { profileId },
      codeLabels: { shoot_no_contact: ru.profile.shootNoContact },
      fallback: ru.ui.toastError,
    });
    setBusy(false);
    if (res.ok) {
      setConfirmed(true);
      toast(ru.profile.shootConfirmedThanks, 'success');
      router.refresh();
    } else {
      toast(res.error, 'danger');
    }
  }

  if (confirmed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-recognition">
        <Icon name="check" size={16} /> {ru.profile.shootConfirmed}
      </span>
    );
  }
  return (
    <button type="button" onClick={confirm} disabled={busy} className="btn btn-outline btn-sm" title={ru.profile.confirmShootHint}>
      <Icon name="check" size={16} /> {ru.profile.confirmShoot}
    </button>
  );
}
