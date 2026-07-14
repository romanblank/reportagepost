import type { Metadata } from 'next';
import { ru } from '@/i18n/ru';
import { RU_CITIES } from '@/lib/geo-data';
import { CATEGORIES } from '@/lib/category-data';
import { InquiryForm } from './InquiryForm';

export const metadata: Metadata = { title: ru.inquiry.title };

export default function InquiryPage() {
  // Города посева первыми, остальные по алфавиту
  const cities = [...RU_CITIES]
    .sort((a, b) => Number(b.active ?? false) - Number(a.active ?? false) || a.nameRu.localeCompare(b.nameRu, 'ru'))
    .map((c) => ({ slug: c.slug, nameRu: c.nameRu }));

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="text-3xl font-semibold">{ru.inquiry.title}</h1>
      <p className="mt-1 text-sm muted">{ru.inquiry.lead}</p>
      <div className="mt-6">
        <InquiryForm
          cities={cities}
          categories={CATEGORIES.map((c) => ({ slug: c.slug, nameRu: c.nameRu }))}
        />
      </div>
    </main>
  );
}
