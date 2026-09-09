import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL_ENTITY } from '@/lib/legal-entity';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.feedback.title };

/** «Обратная связь» (раздел «О сайте»): куда и с чем писать. */
export default function FeedbackPage() {
  const t = ru.feedback;
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:py-14">
      <div className="max-w-2xl w-full">
        <h1 className="t-h1">{t.title}</h1>
        <p className="mt-3 t-body leading-relaxed">{t.lead}</p>
        <ul className="mt-8 flex flex-col gap-6">
          <li className="border-t border-line pt-5">
            <p className="t-small font-medium">{t.supportTitle}</p>
            <p className="mt-1 t-small muted">{t.supportText}</p>
            <a href={`mailto:${LEGAL_ENTITY.email}`} className="mt-2 inline-block t-small underline">{LEGAL_ENTITY.email}</a>
          </li>
          <li className="border-t border-line pt-5">
            <p className="t-small font-medium">{t.editorialTitle}</p>
            <p className="mt-1 t-small muted">{t.editorialText}</p>
            <a href={`mailto:${ru.journal.submitEmail}`} className="mt-2 inline-block t-small underline">{ru.journal.submitEmail}</a>
          </li>
          <li className="border-t border-line pt-5">
            <p className="t-small font-medium">{t.forumTitle}</p>
            <p className="mt-1 t-small muted">{t.forumText}</p>
            <Link href="/ru/forum/platform" className="mt-2 inline-block t-small underline">{t.forumLink}</Link>
          </li>
        </ul>
      </div>
    </main>
  );
}
