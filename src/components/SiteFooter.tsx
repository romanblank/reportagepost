import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { CookieSettingsLink } from '@/components/CookieSettingsLink';
import { CATALOG_ROOT } from '@/lib/nav';

/**
 * Подвал по прототипу v9 (design-v9/v9.html).
 *
 * Раньше здесь была одна строка из шести ссылок и две подписи — подвал не делал
 * ни навигационной работы (уйти из него было некуда), ни репутационной (кто мы,
 * где нас найти, кому писать). На длинных страницах каталога и профиля это
 * тупик: человек дочитал и упёрся в пустоту.
 *
 * Структура прототипа: колонка бренда с описанием и соцсетями, три колонки
 * разделов (Платформа / Фотографам / Компания), отдельная нижняя строка с
 * копирайтом и служебными ссылками, и дисклеймер по РФ-требованию.
 */
const linkCls = 'block py-1.5 text-sm text-ink-2 transition-colors hover:text-ink';

export function SiteFooter() {
  const columns = [
    {
      title: ru.footer.colPlatform,
      links: [
        { href: CATALOG_ROOT, label: ru.footer.linkCatalog },
        { href: '/ru/match', label: ru.footer.linkMatch },
        { href: '/ru/photo', label: ru.footer.linkFeed },
        { href: '/ru/photo?tab=week', label: ru.footer.linkWeek },
        { href: '/ru/community', label: ru.footer.linkCommunity },
      ],
    },
    {
      title: ru.footer.colPhotographers,
      links: [
        { href: '/ru/register', label: ru.footer.linkJoin },
        { href: '/ru/pro', label: ru.footer.linkTariffs },
        { href: '/ru/community', label: ru.footer.linkShoots },
        { href: '/ru/faq', label: ru.footer.linkHelp },
      ],
    },
    {
      title: ru.footer.colCompany,
      links: [
        { href: '/ru/legal/offer', label: ru.footer.offer },
        { href: '/ru/legal/privacy', label: ru.footer.privacy },
      ],
    },
  ];

  return (
    <footer className="mt-auto border-t border-line pb-20 sm:pb-0" style={{ background: 'var(--surface-2)' }}>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 py-12 sm:grid-cols-2 sm:py-14 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-10">
          <div>
            <span className="flex items-center gap-2.5 text-[12.5px] font-semibold uppercase tracking-[.15em]">
              <span className="inline-block size-2 rounded-full bg-accent" />
              {ru.nav.brand}
            </span>
            <p className="mt-4 max-w-[34ch] text-sm leading-relaxed muted">{ru.footer.about}</p>
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="t-caption muted" style={{ fontFamily: 'var(--font-mono)' }}>{col.title}</h2>
              <div className="mt-3">
                {col.links.map((l) => (
                  <Link key={l.href + l.label} href={l.href} className={linkCls}>{l.label}</Link>
                ))}
              </div>
            </nav>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-5 border-t border-line py-5 text-[12.5px] muted">
          <span>{ru.footer.copyright}</span>
          <span className="flex flex-wrap items-center gap-5">
            <Link href="/ru/register" className="transition-colors hover:text-ink">{ru.footer.becomeAuthor}</Link>
            <Link href="/ru/faq" className="transition-colors hover:text-ink">{ru.footer.writeUs}</Link>
            {/* Отзыв решения по cookie — не сложнее его дачи */}
            <CookieSettingsLink />
          </span>
        </div>

        <p className="max-w-[80ch] pb-7 text-[11.5px] leading-relaxed muted">
          {ru.footer.metaDisclaimer} {ru.footer.disclaimerExtra}
        </p>
      </div>
    </footer>
  );
}
