'use client';

import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }
  return (
    <button type="button" onClick={logout} className="opacity-70 hover:opacity-100">
      {ru.nav.logout}
    </button>
  );
}
