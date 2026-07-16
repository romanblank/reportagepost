import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { formatRubMinor } from '@/lib/money';
import {
  PLAN_FEATURES,
  PRO_MONTHLY_MINOR,
  PRO_ANNUAL_MINOR,
  PRO_ANNUAL_MONTHLY_EQUIV_MINOR,
  PRO_ANNUAL_SAVING_PCT,
} from '@/lib/pricing';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.pro.kicker };
export const dynamic = 'force-dynamic'; // CTA зависит от сессии/роли

function Check({ on }: { on: boolean }) {
  return on ? (
    <span aria-hidden className="text-recognition">✓</span>
  ) : (
    <span aria-hidden className="text-muted/40">—</span>
  );
}

export default async function ProPage() {
  const session = await getSession();
  const isPhotographer = session?.role === 'PHOTOGRAPHER';

  const cta = session
    ? isPhotographer
      ? { href: '/ru/cabinet', label: ru.pro.ctaBecomePro }
      : { href: '/ru/cabinet', label: ru.pro.ctaInCabinet }
    : { href: '/ru/register', label: ru.pro.ctaRegister };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:py-16">
      <header className="max-w-2xl">
        <p className="t-caption text-recognition">{ru.pro.kicker}</p>
        <h1 className="t-h1 mt-3 text-balance">{ru.pro.title}</h1>
        <p className="mt-4 t-body-lg muted">{ru.pro.lead}</p>
      </header>

      {/* Тарифные карточки */}
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="card flex flex-col p-6">
          <h2 className="t-h3">{ru.pro.planFree}</h2>
          <p className="mt-2 text-3xl font-semibold">{ru.pro.free}</p>
          <p className="mt-1 text-sm muted">&nbsp;</p>
          <ul className="mt-5 flex flex-col gap-2.5 text-sm">
            {PLAN_FEATURES.filter((f) => f.free).map((f) => (
              <li key={f.key} className="flex gap-2.5"><Check on /> <span>{ru.pro.features[f.key]}</span></li>
            ))}
          </ul>
        </div>

        <div className="card flex flex-col border-recognition/40 bg-recognition-soft/30 p-6">
          <div className="flex items-center justify-between">
            <h2 className="t-h3 text-recognition">{ru.pro.planPro}</h2>
            <span className="rounded-sm bg-recognition-soft px-2 py-0.5 text-xs font-medium text-recognition">
              {ru.pro.annualSaving(PRO_ANNUAL_SAVING_PCT)}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold">{formatRubMinor(PRO_MONTHLY_MINOR)}</span>
            <span className="text-sm muted">{ru.pro.perMonth}</span>
          </div>
          <p className="mt-1 text-sm muted">
            {formatRubMinor(PRO_ANNUAL_MINOR)} {ru.pro.perYear} · {ru.pro.annualEquiv(formatRubMinor(PRO_ANNUAL_MONTHLY_EQUIV_MINOR))}
          </p>
          <Link href={cta.href} className="btn btn-accent mt-5 w-full py-2.5">{cta.label}</Link>
        </div>
      </div>

      {/* Сравнение */}
      <section className="mt-12">
        <h2 className="t-h3">{ru.pro.compareTitle}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2.5 pr-4 font-normal muted">&nbsp;</th>
                <th className="w-24 py-2.5 text-center font-medium">{ru.pro.planFree}</th>
                <th className="w-24 py-2.5 text-center font-medium text-recognition">{ru.pro.planPro}</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_FEATURES.map((f) => (
                <tr key={f.key} className="border-b border-line/60">
                  <td className="py-2.5 pr-4">{ru.pro.features[f.key]}</td>
                  <td className="py-2.5 text-center"><Check on={f.free} /></td>
                  <td className="py-2.5 text-center"><Check on /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-8 max-w-2xl text-xs text-muted/70">{ru.pro.betaNote}</p>
    </main>
  );
}
