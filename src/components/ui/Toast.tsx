'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ru } from '@/i18n/ru';
import { Icon } from '@/components/ui/Icon';

// Единый канал результата действий (правило проекта: не alert — toast).
// Регион role="status" aria-live="polite" (закрывает пробел aria-live из аудита).
// Заменяет тихие откаты оптимистичных тоглов.

type ToastKind = 'success' | 'danger' | 'warning' | 'info';
interface ToastItem { id: number; kind: ToastKind; text: string }

interface ToastApi {
  toast: (text: string, kind?: ToastKind) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  // Фолбэк-нооп: компонент вне провайдера не должен падать (SSR/тесты)
  return ctx ?? { toast: () => {} };
}

const KIND_CLASS: Record<ToastKind, string> = {
  success: 'border-l-success',
  danger: 'border-l-danger',
  warning: 'border-l-warning',
  info: 'border-l-info',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const toast = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = ++seq.current;
    setItems((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismiss = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:items-end"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-line border-l-4 bg-surface p-3 shadow-lg ${KIND_CLASS[t.kind]}`}
          >
            <span className="t-small flex-1">{t.text}</span>
            <button type="button" aria-label={ru.ui.close} onClick={() => dismiss(t.id)}
              className="shrink-0 text-muted transition hover:text-ink">
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
