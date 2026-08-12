'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';

// Админ-контрол верификации на странице профиля (виден только ADMIN).
export function VerifyButton({ profileId, verified }: { profileId: string; verified: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    const res = await apiFetch('/api/admin/verify', { method: 'POST', body: { profileId, verified: !verified } });
    setPending(false);
    if (res?.ok) router.refresh();
  }

  return (
    <button type="button" onClick={toggle} disabled={pending}
      className="rounded-full border border-line px-3 py-1 t-fine text-muted transition hover:text-ink disabled:opacity-50">
      {verified ? ru.profile.adminUnverify : ru.profile.adminVerify}
    </button>
  );
}
