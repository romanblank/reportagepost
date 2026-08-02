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
/**
 * Сетка карточек каталога по прототипу v9 (scratchpad/designs/v9-catalog.html).
 *
 * Прежняя карточка была «картинка + подпись»: имя мелким шрифтом, под ним жанр
 * капсом — и всё. Выбирать по такой карточке нельзя: ни цены, ни доверия, ни
 * формата. Заказчик открывал профиль за профилем, чтобы узнать самое базовое.
 *
 * В прототипе карточка отвечает на четыре вопроса прямо в сетке: сколько стоит,
 * работал ли автор на самом деле (подтверждённые съёмки), снимает ли видео и
 * возвращаются ли к нему. Общая для города и для «город × категория», чтобы
 * верстка и alt не расходились.
 */
export function CatalogCards({ cards, cityName }: { cards: CatalogCard[]; cityName: string }) {
  return (
    <ul className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const catNames = card.categories.map((slug) => categoryNameRu(slug));
        const alt = ru.catalog.cardAlt(`${card.firstName} ${card.lastName}`, cityName);
        return (
          <li key={card.username}>
            <Link href={`/ru/photographer/${card.username}`}
              className="group flex h-full flex-col overflow-hidden rounded-media border border-line bg-surface transition-colors duration-300 hover:border-line-2">
              <div className="relative overflow-hidden bg-surface-2">
                {card.coverKey ? (
                  // thumb 640 вместо web 2048 (аудит P1): карточка ~380px на экране,
                  // а грузилось 300-700КБ — каталог весил ~10МБ. srcSet отдаёт
                  // полноразмерный вариант только retina-экранам.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbVariantUrl(card.coverKey)}
                    srcSet={`${thumbVariantUrl(card.coverKey)} 640w, ${webVariantUrl(card.coverKey)} 2048w`}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
                    alt={alt} loading="lazy"
                    className="aspect-[4/5] w-full object-cover transition duration-[600ms] ease-out group-hover:scale-[1.03]" />
                ) : (
                  <div className="grid aspect-[4/5] w-full place-items-center">
                    <Avatar avatarKey={card.avatarKey} firstName={card.firstName} lastName={card.lastName} size={72} />
                  </div>
                )}

                {/* Факт доверия поверх кадра: съёмки, подтверждённые обеими
                    сторонами. Точка-маркёр — тот же зелёный, что у verified. */}
                {card.shootCount > 0 && (
                  <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-md bg-black/65 px-2 py-1 text-[11px] text-white backdrop-blur-sm">
                    <i className="inline-block size-[5px] rounded-full bg-verified" />
                    {ru.catalog.cardShoots(card.shootCount)}
                  </span>
                )}
                <span className="absolute right-2.5 top-2.5 rounded-md bg-black/65 px-2 py-1 text-[11px] text-white backdrop-blur-sm">
                  {card.doesVideo ? ru.profile.formatsBoth : ru.profile.formatsPhoto}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-4">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[17px]" style={{ fontFamily: 'var(--font-display)' }}>
                    {card.firstName} {card.lastName}
                  </span>
                  {card.verified && <VerifiedBadge label={ru.profile.verified} size={15} />}
                  {card.tier !== 'FREE' && <TierBadge tier={card.tier} label={ru.pro.tierName[card.tier]} />}
                </span>
                <span className="mt-1 truncate text-sm muted">
                  {cityName}{catNames.length > 0 ? ` · ${catNames.join(', ')}` : ''}
                </span>

                {/* Нижняя строка: цена и факт доверия — то, по чему сравнивают */}
                <span className="mt-auto flex items-baseline justify-between gap-3 border-t border-line pt-3 text-sm"
                  style={{ marginTop: 'auto', paddingTop: '0.75rem' }}>
                  <span className="tnum">
                    {card.minPackage ? (
                      <>
                        <span className="muted">{ru.catalog.priceFrom} </span>
                        <b className="font-medium">{formatRubMinor(card.minPackage.priceMinor)}</b>
                      </>
                    ) : (
                      <span className="muted">{ru.catalog.priceOnRequest}</span>
                    )}
                  </span>
                  <span className="shrink-0 tnum text-[13px] muted">
                    {card.returningCount > 0
                      ? ru.catalog.cardReturning(card.returningCount)
                      : card.recommendCount > 0
                        ? ru.catalog.cardRecommends(card.recommendCount)
                        : card.saveCount > 0
                          ? ru.catalog.cardSaves(card.saveCount)
                          : ''}
                  </span>
                </span>
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
