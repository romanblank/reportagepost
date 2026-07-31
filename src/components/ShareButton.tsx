'use client';

import { ru } from '@/i18n/ru';
import { useToast } from '@/components/ui/Toast';

// Шеринг страницы-как-сайта: нативный navigator.share, фолбэк — копирование ссылки.
export function ShareButton({ path, title }: { path: string; title: string }) {
  const { toast } = useToast();

  async function share() {
    const url = typeof window !== 'undefined' ? window.location.origin + path : path;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* пользователь отменил — не ошибка */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(ru.profile.linkCopied, 'success');
    } catch {
      toast(ru.ui.toastError, 'danger');
    }
  }

  return (
    <button type="button" onClick={share} className="rounded-full border border-line px-3 py-1.5 text-sm transition hover:bg-surface-2">
      {ru.profile.share}
    </button>
  );
}
