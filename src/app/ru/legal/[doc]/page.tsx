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
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
      <div className="mt-4 rounded-xl border border-line bg-surface-2 p-5">
        <p className="font-medium">{ru.legal.preparingTitle}</p>
        <p className="mt-2 text-sm leading-relaxed muted">{ru.legal.preparingText}</p>
      </div>
    </main>
  );
}
