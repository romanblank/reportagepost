import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatRubMinor } from '@/lib/money';
import { PLAN_FEATURES, featureInTier, priceForCity, annualSavingPct, type PlanTier } from '@/lib/pricing';
import { cityNameRu } from '@/lib/geo-data';
import { ru, label } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.pro.kicker };
export const dynamic = 'force-dynamic'; // цена/CTA зависят от сессии, города, роли

/**
 * Ячейка «есть / нет» в сравнении тарифов.
 *
 * Значок скрыт от экранных читалок, но само значение — нет: раньше все ячейки
 * были `aria-hidden`, и страница, на которой фотограф решает платить, читалась
 * как список возможностей без единого ответа, входят они в тариф или нет.
 */
function Check({ on }: { on: boolean }) {
  return (
    <>
      <span aria-hidden className={on ? 'text-recognition' : 'text-muted/40'}>{on ? '✓' : '—'}</span>
      <span className="sr-only">{on ? ru.pro.included : ru.pro.notIncluded}</span>
    </>
  );
}

export default async function ProPage() {
  const session = await getSession();
  const isPhotographer = session?.role === 'PHOTOGRAPHER';

  // Цена — по городу фотографа; для гостей/заказчиков — столичный якорь (tier A).
  let citySlug: string | null = null;
  if (isPhotographer && session) {
    const profile = await db.photographerProfile.findUnique({
      where: { userId: session.userId },
      include: { city: true },
    });
    citySlug = profile?.city.slug ?? null;
  }
  const primePrice = priceForCity(citySlug ?? 'moscow', 'PRIME');
  const elitePrice = priceForCity(citySlug ?? 'moscow', 'ELITE');
  const cityLabel = citySlug ? cityNameRu(citySlug) : null;

  const cta = session
    ? isPhotographer
      ? { href: '/ru/cabinet', label: ru.pro.ctaBecomePro }
      : { href: '/ru/cabinet', label: ru.pro.ctaInCabinet }
    : { href: '/ru/register', label: ru.pro.ctaRegister };

  const priceNote = cityLabel ? ru.pro.priceForCity(cityLabel) : ru.pro.priceVaries;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-16">
      <header className="max-w-2xl">
        <p className="t-caption text-recognition">{ru.pro.kicker}</p>
        <h1 className="t-h1 mt-3 text-balance">{ru.pro.title}</h1>
        <p className="mt-4 t-body-lg muted">{ru.pro.lead}</p>
      </header>

      {/* Тарифные карточки: Базовый / Prime / Elite */}
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {/* Базовый */}
        <div className="card flex flex-col p-6">
          <h2 className="t-h3">{ru.pro.planFree}</h2>
          <p className="mt-2 text-3xl" style={{ fontFamily: 'var(--font-display)' }}>{ru.pro.free}</p>
          <p className="mt-1 text-sm muted">&nbsp;</p>
          <ul className="mt-5 flex flex-col gap-2.5 text-sm">
            {PLAN_FEATURES.filter((f) => f.minTier === 'FREE').map((f) => (
              <li key={f.key} className="flex gap-2.5"><Check on /> <span>{label(ru.pro.features, f.key)}</span></li>
            ))}
          </ul>
        </div>

        {/* Prime — акцентная */}
        <div className="card flex flex-col border-recognition/40 bg-recognition-soft/30 p-6">
          <div className="flex items-center justify-between">
            <h2 className="t-h3 text-recognition">{ru.pro.planPrime}</h2>
            <span className="rounded-sm bg-recognition-soft px-2 py-0.5 text-xs font-medium text-recognition">
              {ru.pro.annualSaving(annualSavingPct(primePrice))}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl" style={{ fontFamily: 'var(--font-display)' }}>{formatRubMinor(primePrice.monthlyMinor)}</span>
            <span className="text-sm muted">{ru.pro.perMonth}</span>
          </div>
          <p className="mt-1 text-sm muted">{formatRubMinor(primePrice.annualMinor)} {ru.pro.perYear} · {priceNote}</p>
          <Link href={cta.href} className="btn btn-accent mt-5 w-full py-2.5">{cta.label}</Link>
        </div>

        {/* Elite */}
        <div className="card flex flex-col border-recognition/60 p-6">
          <div className="flex items-center justify-between">
            <h2 className="t-h3 text-recognition">{ru.pro.planElite}</h2>
            <span className="rounded-sm bg-recognition px-2 py-0.5 text-xs font-medium text-recognition-ink">
              {ru.pro.annualSaving(annualSavingPct(elitePrice))}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl" style={{ fontFamily: 'var(--font-display)' }}>{formatRubMinor(elitePrice.monthlyMinor)}</span>
            <span className="text-sm muted">{ru.pro.perMonth}</span>
          </div>
          <p className="mt-1 text-sm muted">{formatRubMinor(elitePrice.annualMinor)} {ru.pro.perYear} · {priceNote}</p>
          <Link href={cta.href} className="btn btn-outline mt-5 w-full py-2.5">{cta.label}</Link>
        </div>
      </div>

      {/* Сравнение */}
      <section className="mt-12">
        <h2 className="t-h3">{ru.pro.compareTitle}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="py-2.5 pr-4 font-normal muted"><span className="sr-only">{ru.pro.featureColumn}</span></th>
                <th scope="col" className="w-24 py-2.5 text-center font-medium">{ru.pro.planFree}</th>
                <th scope="col" className="w-24 py-2.5 text-center font-medium text-recognition">{ru.pro.planPrime}</th>
                <th scope="col" className="w-24 py-2.5 text-center font-medium text-recognition">{ru.pro.planElite}</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_FEATURES.map((f) => (
                <tr key={f.key} className="border-b border-line/60">
                  <th scope="row" className="py-2.5 pr-4 text-left font-normal">{label(ru.pro.features, f.key)}</th>
                  {(['FREE', 'PRIME', 'ELITE'] as PlanTier[]).map((t) => (
                    <td key={t} className="py-2.5 text-center"><Check on={featureInTier(f, t)} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-8 max-w-2xl text-xs text-muted">{ru.pro.betaNote}</p>
    </main>
  );
}
