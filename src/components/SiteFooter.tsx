import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { CATALOG_ROOT } from '@/lib/nav';

// Подвал (MyWed-паритет): навигация + юрссылки + Meta-дисклеймер (РФ, урок vault).
export function SiteFooter() {
  const linkCls = 'text-sm text-muted transition-colors hover:text-ink';
  return (
    <footer className="mt-auto border-t border-line/70 pb-20 pt-8 sm:pb-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="inline-block h-2 w-2 rounded-full bg-accent" />
            {ru.nav.brand}
          </span>
          <Link href={CATALOG_ROOT} className={linkCls}>{ru.nav.catalog}</Link>
          <Link href="/ru/community" className={linkCls}>{ru.nav.community}</Link>
          <Link href="/ru/legal/privacy" className={linkCls}>{ru.footer.privacy}</Link>
          <Link href="/ru/legal/offer" className={linkCls}>{ru.footer.offer}</Link>
        </div>
        <p className="text-xs text-muted/70">{ru.footer.tagline}</p>
        <p className="text-[11px] text-muted/60">{ru.footer.metaDisclaimer}</p>
      </div>
    </footer>
  );
}
