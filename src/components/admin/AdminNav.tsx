'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ru } from '@/i18n/ru';

/**
 * Меню разделов администрирования.
 *
 * До него попасть из очереди модерации в жалобы можно было только через
 * главную: каждый переход стоил двух кликов и возврата. Для человека, который
 * ведёт платформу один, это и есть разница между «инструмент» и «набор
 * страниц» — он ходит между разделами десятки раз в день.
 *
 * Текущий раздел подсвечен: без этого в глубине (карточка автора внутри
 * модерации) непонятно, где находишься.
 */
export type NavCounters = Partial<Record<string, number>>;

const SECTIONS: { href: string; key: keyof typeof ru.adminNav.sections }[] = [
  { href: '/ru/admin', key: 'dashboard' },
  { href: '/ru/admin/moderation', key: 'moderation' },
  { href: '/ru/admin/queue', key: 'queue' },
  { href: '/ru/admin/inquiries', key: 'inquiries' },
  { href: '/ru/admin/billing', key: 'billing' },
  { href: '/ru/admin/users', key: 'users' },
  { href: '/ru/admin/reports', key: 'reports' },
  { href: '/ru/admin/audit', key: 'audit' },
  { href: '/ru/admin/mail', key: 'mail' },
];

export function AdminNav({ counters }: { counters?: NavCounters }) {
  const pathname = usePathname() ?? '';

  return (
    <nav aria-label={ru.adminNav.label} className="mb-6 border-b border-line">
      <ul className="-mb-px flex flex-nowrap gap-x-1 overflow-x-auto sm:flex-wrap sm:gap-y-1">
        {SECTIONS.map((s) => {
          // Главная активна только точным совпадением, остальные — с вложенными
          // страницами: карточка автора должна подсвечивать «Модерацию»
          const active = s.href === '/ru/admin' ? pathname === s.href : pathname.startsWith(s.href);
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-block whitespace-nowrap border-b-2 px-3 py-2 t-small transition-colors ${
                  active
                    ? 'border-accent text-ink'
                    : 'border-transparent text-muted hover:border-line-2 hover:text-ink-2'
                }`}
              >
                {ru.adminNav.sections[s.key]}
                {/* Счётчик — не украшение: без него узнать о накопившейся
                    очереди можно только зайдя в раздел */}
                {counters?.[s.key] ? (
                  <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 t-fine tabular-nums text-accent">
                    {counters[s.key]}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
