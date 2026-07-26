import type { Metadata } from 'next';
import Link from 'next/link';
import { matchPhotographers, parseBriefText, type Brief, type Match } from '@/lib/matching';
import { RU_CITIES, cityNameRu } from '@/lib/geo-data';
import { CATEGORIES, categoryNameRu } from '@/lib/category-data';
import { webVariantUrl } from '@/lib/photos';
import { formatRubMinor } from '@/lib/money';
import { ru } from '@/i18n/ru';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/Badge';

export const metadata: Metadata = { title: ru.match.metaTitle };
export const dynamic = 'force-dynamic'; // бриф в searchParams + запрос к БД

const CITIES = [...RU_CITIES].sort(
  (a, b) => Number(b.active ?? false) - Number(a.active ?? false) || a.nameRu.localeCompare(b.nameRu, 'ru'),
);

function validCity(v?: string) {
  return v && RU_CITIES.some((c) => c.slug === v) ? v : undefined;
}
function validCat(v?: string) {
  return v && CATEGORIES.some((c) => c.slug === v) ? v : undefined;
}

export default async function MatchPage(props: {
  searchParams: Promise<{ text?: string; city?: string; category?: string; date?: string; budget?: string }>;
}) {
  const sp = await props.searchParams;
  const submitted = Boolean(sp.text || sp.city || sp.category || sp.budget || sp.date);

  let brief: Brief | null = null;
  let matches: Match[] = [];
  let relaxed = false;

  if (submitted) {
    // ИИ разбирает свободный текст, явные поля формы имеют приоритет (guard в matching)
    const parsed = sp.text ? await parseBriefText(sp.text) : {};
    const citySlug = validCity(sp.city) ?? parsed.citySlug ?? 'moscow';
    const categorySlug = validCat(sp.category) ?? parsed.categorySlug;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? new Date(`${sp.date}T00:00:00Z`) : undefined;
    const budgetRub = Number(sp.budget) > 0 ? Number(sp.budget) : undefined;
    const maxBudgetMinor = budgetRub ? budgetRub * 100 : parsed.maxBudgetMinor;
    brief = { citySlug, categorySlug, date, maxBudgetMinor, text: sp.text };
    const res = await matchPhotographers(brief);
    matches = res.matches;
    relaxed = res.relaxed;
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">
      <header className="max-w-2xl">
        <p className="t-caption text-recognition">{ru.match.kicker}</p>
        <h1 className="t-h1 mt-2 text-balance">{ru.match.title}</h1>
        <p className="mt-3 t-body-lg muted">{ru.match.lead}</p>
      </header>

      <form method="get" className="mt-8 rounded-media border border-line bg-surface p-4 sm:p-5">
        <label className="block">
          <span className="field-hint mt-0">{ru.match.textLabel}</span>
          <textarea name="text" rows={3} defaultValue={sp.text ?? ''} placeholder={ru.match.textPlaceholder}
            className="input mt-1 w-full resize-y" />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="field-hint mt-0">{ru.match.cityLabel}</span>
            <select name="city" defaultValue={validCity(sp.city) ?? ''} className="input mt-1 w-full">
              <option value="">{ru.match.cityAny}</option>
              {CITIES.map((c) => <option key={c.slug} value={c.slug}>{c.nameRu}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="field-hint mt-0">{ru.match.categoryLabel}</span>
            <select name="category" defaultValue={validCat(sp.category) ?? ''} className="input mt-1 w-full">
              <option value="">{ru.match.categoryAny}</option>
              {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.nameRu}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="field-hint mt-0">{ru.match.dateLabel}</span>
            <input type="date" name="date" defaultValue={sp.date ?? ''} className="input mt-1 w-full" />
          </label>
          <label className="text-sm">
            <span className="field-hint mt-0">{ru.match.budgetLabel}</span>
            <input type="number" name="budget" min={0} step={1} inputMode="numeric" defaultValue={sp.budget ?? ''}
              placeholder="₽/час" className="input mt-1 w-full" />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="submit" className="btn btn-accent px-7 py-2.5">{ru.match.submit}</button>
          <span className="t-caption muted">{ru.match.aiHint}</span>
        </div>
      </form>

      {submitted && brief && (
        <section className="mt-9">
          {/* Распознанный бриф — прозрачность (что ИИ понял из свободного текста) */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="t-caption muted">{ru.match.understood}:</span>
            <span className="rounded-full bg-surface-2 px-3 py-1 font-medium">{cityNameRu(brief.citySlug)}</span>
            {brief.categorySlug && <span className="rounded-full bg-surface-2 px-3 py-1 font-medium">{categoryNameRu(brief.categorySlug)}</span>}
            {brief.maxBudgetMinor && <span className="rounded-full bg-surface-2 px-3 py-1 font-medium tnum">{ru.match.budgetChip(formatRubMinor(brief.maxBudgetMinor))}</span>}
            {brief.date && <span className="rounded-full bg-surface-2 px-3 py-1 font-medium tnum">{brief.date.toISOString().slice(0, 10)}</span>}
          </div>
          <div className="mt-6">
          {matches.length === 0 ? (
            <div className="rounded-media border border-dashed border-line-2 p-8 text-center">
              <p className="muted">{ru.match.empty}</p>
              <Link href={`/ru/inquiry`} className="btn btn-outline mt-4 px-5">{ru.match.emptyCta}</Link>
            </div>
          ) : (
            <>
              <h2 className="t-h3">{ru.match.resultsTitle(matches.length)}</h2>
              {relaxed && <p className="mt-1.5 text-sm text-recognition">{ru.match.relaxedNote}</p>}
              <ul className="mt-5 flex flex-col gap-4">
                {matches.map(({ card, reason }) => (
                  <li key={card.username} className="group flex gap-4 rounded-media border border-line p-3 transition hover:border-line-2 sm:p-4">
                    <Link href={`/ru/photographer/${card.username}`}
                      className="relative block h-28 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:h-32 sm:w-28">
                      {card.coverKey ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={webVariantUrl(card.coverKey)} alt={`${card.firstName} ${card.lastName}`} loading="lazy"
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]" />
                      ) : (
                        <span className="grid h-full w-full place-items-center">
                          <Avatar avatarKey={card.avatarKey} firstName={card.firstName} lastName={card.lastName} size={48} />
                        </span>
                      )}
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/ru/photographer/${card.username}`} className="font-medium hover:underline">
                          {card.firstName} {card.lastName}
                        </Link>
                        {card.verified && <VerifiedBadge label={ru.profile.verified} size={15} />}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed muted">{reason}</p>
                      <div className="mt-auto flex items-center gap-3 pt-2">
                        {card.minPackage && (
                          <span className="tnum text-sm font-semibold">{formatRubMinor(card.minPackage.priceMinor)}</span>
                        )}
                        <Link href={`/ru/inquiry?photographer=${card.username}`} className="btn btn-outline btn-sm ml-auto">
                          {ru.match.write}
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          </div>
        </section>
      )}
    </main>
  );
}
