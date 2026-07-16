import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LEGAL_DOCS } from '@/lib/legal-content';
import { ru } from '@/i18n/ru';

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata(props: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await props.params;
  return { title: LEGAL_DOCS[doc]?.title ?? ru.legal.preparingTitle };
}

// Юрдокументы (152-ФЗ). Содержимое — @/lib/legal-content; реестровые реквизиты
// ИП подставляются из @/lib/legal-entity (плейсхолдеры до заполнения оператором).
export default async function LegalPage(props: { params: Promise<{ doc: string }> }) {
  const { doc } = await props.params;
  const document = LEGAL_DOCS[doc];
  if (!document) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:py-16">
      <p className="t-caption text-recognition">{ru.footer.tagline}</p>
      <h1 className="t-h1 mt-3 text-balance">{document.title}</h1>
      <p className="mt-2 text-sm muted">{ru.legal.effectiveFrom(document.effectiveFrom)}</p>

      <article className="mt-8 flex flex-col gap-6 border-t border-line pt-8">
        {document.sections.map((s, i) => (
          <section key={i} className="flex flex-col gap-2.5">
            {s.heading && <h2 className="t-h3">{s.heading}</h2>}
            {s.body?.map((p, j) => (
              <p key={j} className="t-body leading-relaxed text-ink/90">{p}</p>
            ))}
            {s.list && (
              <ul className="flex flex-col gap-1.5">
                {s.list.map((li, j) => (
                  <li key={j} className="flex gap-2.5 t-body leading-relaxed text-ink/90">
                    <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-recognition" />
                    <span>{li}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>
    </main>
  );
}
