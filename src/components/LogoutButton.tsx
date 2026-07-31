'use client';

import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.push('/');
    router.refresh();
  }
  return (
    <button type="button" onClick={logout} className="opacity-70 hover:opacity-100">
      {ru.nav.logout}
    </button>
  );
}
