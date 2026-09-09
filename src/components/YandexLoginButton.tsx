import { ru } from '@/i18n/ru';

// Кнопка «Войти через Яндекс» + разделитель «или». Ведёт на серверный старт-роут
// (там генерится CSRF-state и редирект на согласие Яндекса). Обычная ссылка —
// не нужен JS.
export function YandexLoginButton({ next }: { next?: string }) {
  const href = next && next.startsWith('/ru/')
    ? `/api/auth/yandex/start?next=${encodeURIComponent(next)}`
    : '/api/auth/yandex/start';
  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 t-fine muted">
        <span className="h-px flex-1 bg-line" />
        {ru.auth.yandexOr}
        <span className="h-px flex-1 bg-line" />
      </div>
      <a href={href}
        className="btn btn-outline mt-4 flex w-full items-center justify-center gap-2 py-2.5">
        <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-[#fc3f1d] text-[13px] font-bold text-white">Я</span>
        {ru.auth.yandexBtn}
      </a>
    </div>
  );
}
