import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { ru } from '@/i18n/ru';
import { getSession } from '@/lib/auth';
import { RU_CITIES } from '@/lib/geo-data';
import { CATEGORIES } from '@/lib/category-data';
import { InquiryForm } from './InquiryForm';

export const metadata: Metadata = { title: ru.inquiry.title };
export const dynamic = 'force-dynamic'; // читает ?photographer + БД

export default async function InquiryPage(props: { searchParams: Promise<{ photographer?: string }> }) {
  const { photographer } = await props.searchParams;

  // Префилл контактов залогиненного заказчика — меньше трения на конверсионной форме
  const session = await getSession();
  const contact = session
    ? await db.user
        .findUnique({ where: { id: session.userId }, select: { firstName: true, lastName: true, email: true } })
        .then((u) => (u ? { name: `${u.firstName} ${u.lastName}`.trim(), email: u.email ?? undefined } : undefined))
    : undefined;

  // Города посева первыми, остальные по алфавиту
  const cities = [...RU_CITIES]
    .sort((a, b) => Number(b.active ?? false) - Number(a.active ?? false) || a.nameRu.localeCompare(b.nameRu, 'ru'))
    .map((c) => ({ slug: c.slug, nameRu: c.nameRu }));

  // Префилл из профиля фотографа (кнопка «Отправить заявку»)
  let prefill: { citySlug?: string; categorySlug?: string; photographerName?: string } | undefined;
  if (photographer) {
    const p = await db.photographerProfile.findFirst({
      where: { username: photographer, status: 'APPROVED' },
      include: {
        user: { select: { firstName: true, lastName: true } },
        city: true,
        categories: { include: { category: true } },
      },
    });
    if (p) {
      prefill = {
        citySlug: p.city.slug,
        categorySlug: p.categories[0]?.category.slug,
        photographerName: `${p.user.firstName} ${p.user.lastName}`,
      };
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="t-h1">{ru.inquiry.title}</h1>
      <p className="mt-1 t-small muted">{ru.inquiry.lead}</p>
      <div className="mt-6">
        <InquiryForm
          cities={cities}
          categories={CATEGORIES.map((c) => ({ slug: c.slug, nameRu: c.nameRu }))}
          prefill={prefill}
          contact={contact}
        />
      </div>
    </main>
  );
}
