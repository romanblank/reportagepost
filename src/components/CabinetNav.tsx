'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ru } from '@/i18n/ru';

/**
 * Меню разделов кабинета.
 *
 * Раньше единственным способом попасть из портфолио в календарь был возврат на
 * главную кабинета: разделы существовали как плитки, а не как места, между
 * которыми ходят. Фотограф во время сборки анкеты ходит между ними постоянно —
 * загрузил кадры, поправил цены, проверил занятые даты.
 *
 * Разделы, требующие одобренной анкеты, до одобрения не показываем: ссылка,
 * которая приведёт к «сначала дождитесь проверки», — обещание, которое мы сами
 * не выполняем.
 *
 * По той же причине у администратора без собственной анкеты нет ни «Анкеты»,
 * ни «Портфолио», ни «Подписки»: клик по ним возвращал в кабинет, то есть меню
 * показывало то, чего у человека нет.
 */
const BASE: { href: string; label: string }[] = [
  { href: '/ru/cabinet', label: ru.cabinetNav.overview },
];

const WITH_PROFILE: { href: string; label: string }[] = [
  { href: '/ru/cabinet/profile/edit', label: ru.cabinetNav.profile },
  { href: '/ru/cabinet/portfolio', label: ru.cabinetNav.portfolio },
  { href: '/ru/cabinet/subscription', label: ru.cabinetNav.subscription },
];

const SETTINGS: { href: string; label: string }[] = [
  { href: '/ru/cabinet/settings', label: ru.cabinetNav.settings },
];

const APPROVED_ONLY: { href: string; label: string }[] = [
  { href: '/ru/cabinet/stories', label: ru.cabinetNav.stories },
  { href: '/ru/cabinet/availability', label: ru.cabinetNav.availability },
  { href: '/ru/cabinet/presentation', label: ru.cabinetNav.presentation },
  { href: '/ru/cabinet/sales-kit', label: ru.cabinetNav.salesKit },
  { href: '/ru/cabinet/articles', label: ru.cabinetNav.articles },
  { href: '/ru/cabinet/moderation', label: ru.cabinetNav.moderation },
];

export function CabinetNav({
  approved,
  hasProfile = true,
}: {
  approved: boolean;
  /** Есть ли у человека анкета вообще: у администратора её может не быть. */
  hasProfile?: boolean;
}) {
  const pathname = usePathname() ?? '';
  const items = [
    ...BASE,
    ...(hasProfile ? WITH_PROFILE : []),
    ...(approved ? APPROVED_ONLY : []),
    ...SETTINGS,
  ];

  return (
    <nav aria-label={ru.cabinetNav.label} className="mb-6 border-b border-line">
      <ul className="-mb-px flex flex-nowrap gap-x-1 overflow-x-auto sm:flex-wrap sm:gap-y-1">
        {items.map((item) => {
          const active =
            item.href === '/ru/cabinet' ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-block whitespace-nowrap border-b-2 px-3 py-2 t-small transition-colors ${
                  active
                    ? 'border-accent text-ink'
                    : 'border-transparent text-muted hover:border-line-2 hover:text-ink-2'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
