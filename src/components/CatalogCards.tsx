import Link from 'next/link';
import type { CatalogCard } from '@/lib/catalog';
import { webVariantUrl, thumbVariantUrl } from '@/lib/photos';
import { formatRubMinor } from '@/lib/money';
import { CATEGORIES, categoryNameRu } from '@/lib/category-data';
import { ru } from '@/i18n/ru';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge, TierBadge } from '@/components/ui/Badge';

// Галерейная сетка карточек каталога. Общая для города и город×категория (SEO),
// чтобы верстка/alt не расходились. alt осмысленный (SEO — половина модели).
export function CatalogCards({ cards, cityName }: { cards: CatalogCard[]; cityName: string }) {
  return (
    <ul className="mt-6 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const catNames = card.categories.map((slug) => categoryNameRu(slug));
        const alt = ru.catalog.cardAlt(`${card.firstName} ${card.lastName}`, cityName);
        return (
          <li key={card.username} className="group">
            <Link href={`/ru/photographer/${card.username}`} className="block">
              <div className="relative overflow-hidden rounded-media bg-surface-2 transition-shadow duration-300 group-hover:shadow-[0_14px_36px_-10px_rgba(0,0,0,0.28)]">
                {card.coverKey ? (
                  // thumb 640 вместо web 2048 (аудит P1): карточка ~380px на экране,
                  // а грузилось 300-700КБ — каталог весил ~10МБ. srcSet отдаёт
                  // полноразмерный вариант только retina-экранам.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbVariantUrl(card.coverKey)}
                    srcSet={`${thumbVariantUrl(card.coverKey)} 640w, ${webVariantUrl(card.coverKey)} 2048w`}
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 380px"
                    alt={alt} loading="lazy"
                    className="aspect-[4/5] w-full object-cover transition duration-[600ms] ease-out group-hover:scale-[1.04]" />
                ) : (
                  <div className="grid aspect-[4/5] w-full place-items-center">
                    <Avatar avatarKey={card.avatarKey} firstName={card.firstName} lastName={card.lastName} size={72} />
                  </div>
                )}
                {card.doesVideo && (
                  <span className="absolute right-2.5 top-2.5 rounded-md border border-line bg-surface/75 px-2 py-1 text-[11px] backdrop-blur-sm">
                    {ru.profile.formatsPhotoVideo}
                  </span>
                )}
                {card.minPackage && (
                  // Цена на элегантном скриме снизу кадра (не «белая пилюля»)
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-end bg-gradient-to-t from-black/55 via-black/10 to-transparent px-3 pb-2.5 pt-10">
                    <span className="tnum text-xs font-semibold text-white drop-shadow-sm">
                      {ru.catalog.packageLabel(card.minPackage.hours, formatRubMinor(card.minPackage.priceMinor))}
                    </span>
                  </span>
                )}
              </div>
              <div className="mt-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar avatarKey={card.avatarKey} firstName={card.firstName} lastName={card.lastName} size={24} />
                  <span className="t-small truncate font-medium">{card.firstName} {card.lastName}</span>
                  {card.verified && <VerifiedBadge label={ru.profile.verified} size={15} />}
                  {card.tier !== 'FREE' && <TierBadge tier={card.tier} label={ru.pro.tierName[card.tier]} />}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="t-caption truncate muted">{catNames.join(' · ')}</span>
                  {card.saveCount > 0 && (
                    <span className="t-caption shrink-0 tnum muted">· {ru.catalog.cardSaves(card.saveCount)}</span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// Ссылки «город × категория» — внутренняя перелинковка для SEO.
// vertical — режим боковой панели фильтров (каталог v9); иначе горизонтальная строка чипов.
export function CategoryLinks({
  countrySlug, citySlug, activeCategory, vertical = false,
}: { countrySlug: string; citySlug: string; activeCategory?: string; vertical?: boolean }) {
  const base = `/ru/${countrySlug}/${citySlug}`;
  if (vertical) {
    const item = (href: string, label: string, active: boolean) => (
      <Link key={href} href={href}
        className={`block rounded-md px-3 py-2 text-sm transition ${active ? 'bg-surface-2 font-medium text-accent' : 'muted hover:bg-surface-2 hover:text-ink'}`}>
        {label}
      </Link>
    );
    return (
      <nav className="flex flex-col gap-0.5">
        {item(base, ru.catalog.allCategories, !activeCategory)}
        {CATEGORIES.map((c) => item(`${base}/${c.slug}`, c.nameRu, activeCategory === c.slug))}
      </nav>
    );
  }
  return (
    <nav className="mt-5 -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      <Link href={base} className={`chip shrink-0 ${!activeCategory ? 'chip-active' : ''}`}>
        {ru.catalog.allCategories}
      </Link>
      {CATEGORIES.map((c) => (
        <Link key={c.slug} href={`${base}/${c.slug}`}
          className={`chip shrink-0 ${activeCategory === c.slug ? 'chip-active' : ''}`}>
          {c.nameRu}
        </Link>
      ))}
    </nav>
  );
}
