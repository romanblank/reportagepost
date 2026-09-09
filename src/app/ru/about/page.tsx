import type { Metadata } from 'next';
import Link from 'next/link';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.about.title, description: ru.about.lead };

/**
 * «Цель платформы» (раздел «О сайте», структура партнёра 2026-08-18):
 * зачем проект существует + короткий экскурс в историю репортажа как жанра.
 */
export default function AboutPage() {
  const t = ru.about;
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:py-14">
      <div className="max-w-2xl w-full">
        <h1 className="t-h1 text-balance">{t.title}</h1>
        <p className="mt-3 t-body-lg leading-relaxed">{t.lead}</p>

        <section className="mt-10">
          <h2 className="t-h3">{t.goalTitle}</h2>
          {t.goalParagraphs.map((p) => (
            <p key={p.slice(0, 24)} className="mt-3 t-body leading-relaxed">{p}</p>
          ))}
        </section>

        <section className="mt-10">
          <h2 className="t-h3">{t.historyTitle}</h2>
          {t.historyParagraphs.map((p) => (
            <p key={p.slice(0, 24)} className="mt-3 t-body leading-relaxed">{p}</p>
          ))}
        </section>

        <section className="mt-10 border-t border-line pt-6">
          <p className="t-small muted">
            {t.linksLead}{' '}
            <Link href="/ru/legal/offer" className="underline">{t.linkRules}</Link>{' · '}
            <Link href="/ru/legal/privacy" className="underline">{t.linkPrivacy}</Link>{' · '}
            <Link href="/ru/about/feedback" className="underline">{t.linkFeedback}</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
