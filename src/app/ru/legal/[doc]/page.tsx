import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ru } from '@/i18n/ru';

const DOCS: Record<string, string> = {
  privacy: ru.legal.privacyTitle,
  offer: ru.legal.offerTitle,
};

export async function generateMetadata(props: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await props.params;
  return { title: DOCS[doc] ?? ru.legal.preparingTitle };
}

// Юрдокументы. До публичного запуска (S4) — заглушка: тексты готовит оператор/
// юрист с реальными реквизитами ИП. Платформа в закрытой бете (noindex).
export default async function LegalPage(props: { params: Promise<{ doc: string }> }) {
  const { doc } = await props.params;
  const title = DOCS[doc];
  if (!title) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-20 sm:py-28">
      <p className="t-caption text-recognition">{ru.footer.tagline}</p>
      <h1 className="t-h1 mt-3">{title}</h1>
      <div className="mt-6 max-w-prose border-t border-line pt-6">
        <p className="t-body-lg">{ru.legal.preparingTitle}</p>
        <p className="mt-3 t-body muted">{ru.legal.preparingText}</p>
      </div>
    </main>
  );
}
