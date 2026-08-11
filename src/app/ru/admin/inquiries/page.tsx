import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { adminInquiries, inquiryOverview, INQUIRIES_PER_PAGE, type InquiryFilter } from '@/lib/admin-inquiries';
import { formatDateTimeRu, formatDateRu } from '@/lib/date-format';
import { formatRubMinor } from '@/lib/money';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { AdminNav } from '@/components/admin/AdminNav';
import { PageHeader } from '@/components/PageHeader';
import { Pager } from '@/components/Pager';
import { ru } from '@/i18n/ru';
import { adminCounters } from '@/lib/admin-counters';

export const metadata: Metadata = { title: ru.adminInquiries.title };
export const dynamic = 'force-dynamic';

/**
 * Заявки заказчиков — то, за что фотограф платит подписку.
 *
 * На панели они были числом. Число не показывает главного: дошёл ли заказ до
 * авторов и взял ли его кто-нибудь. Заявка без единого отклика — это человек,
 * которому не ответили, и пока он не ушёл, с этим можно что-то сделать.
 */
type Params = { searchParams: Promise<{ filter?: string; page?: string }> };

const FILTERS: InquiryFilter[] = ['all', 'untouched', 'taken', 'closed'];

export default async function AdminInquiriesPage({ searchParams }: Params) {
  const admin = await requireAdmin();
  if (!admin) redirect('/ru/cabinet');

  const sp = await searchParams;
  const filter = (FILTERS as string[]).includes(sp.filter ?? '') ? (sp.filter as InquiryFilter) : 'all';
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const counters = await adminCounters();
  const [{ items, total }, overview] = await Promise.all([
    adminInquiries(filter, page),
    inquiryOverview(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">
      <AdminNav counters={counters} />
      <PageHeader
        crumbs={[{ href: '/ru/admin', label: ru.adminHome.title }]}
        title={ru.adminInquiries.title}
        lead={ru.adminInquiries.lead}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: ru.adminInquiries.statTotal, value: overview.total, warn: false },
          { label: ru.adminInquiries.statUntouched, value: overview.untouched, warn: overview.untouched > 0 },
          { label: ru.adminInquiries.statTaken, value: overview.taken, warn: false },
          { label: ru.adminInquiries.statGuests, value: overview.guests, warn: false },
        ].map((s) => (
          <div key={s.label} className="rounded-media border border-line bg-surface-2 px-4 py-3">
            <div className={`tnum text-2xl ${s.warn ? 'text-warning' : ''}`}>{s.value}</div>
            <div className="t-caption mt-1 muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Отбор «без единого отклика» — рабочий режим, а не украшение: именно
          с этими заявками ещё можно что-то сделать */}
      <nav className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'all' ? '/ru/admin/inquiries' : `/ru/admin/inquiries?filter=${f}`}
            className={`chip ${filter === f ? 'border-accent text-ink' : ''}`}
          >
            {ru.adminInquiries.filters[f]}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="mt-8 text-sm muted">{ru.adminInquiries.empty}</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {items.map((i) => (
            <li key={i.id} className="rounded-media border border-line bg-surface-2 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="t-small">
                  {i.contactName}
                  {i.isGuest ? <span className="t-caption ml-2 muted">{ru.adminInquiries.guest}</span> : null}
                </span>
                <span className="t-caption muted">{formatDateTimeRu(i.createdAt)}</span>
              </div>

              <p className="t-caption mt-1 muted">
                {cityNameRu(i.citySlug)}
                {i.categorySlug ? ` · ${categoryNameRu(i.categorySlug)}` : ''}
                {i.eventDate ? ` · ${formatDateRu(i.eventDate)}` : ''}
                {i.budgetMinor ? ` · ${formatRubMinor(i.budgetMinor)}` : ''}
              </p>

              <p className="mt-2 text-sm">{i.description.slice(0, 400)}</p>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                {/* Ноль откликов — не строка статистики, а заказчик без ответа */}
                <span className={`t-caption ${i.taken === 0 ? 'text-warning' : 'muted'}`}>
                  {i.taken === 0 ? ru.adminInquiries.noReplies : ru.adminInquiries.takenBy(i.taken)}
                </span>
                {i.declined > 0 ? (
                  <span className="t-caption muted">{ru.adminInquiries.declinedBy(i.declined)}</span>
                ) : null}
                {i.contactPhone ? (
                  <a href={`tel:${i.contactPhone}`} className="t-caption underline muted">{i.contactPhone}</a>
                ) : null}
                {i.contactEmail ? (
                  <a href={`mailto:${i.contactEmail}`} className="t-caption underline muted">{i.contactEmail}</a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pager
        base={filter === 'all' ? '/ru/admin/inquiries' : `/ru/admin/inquiries?filter=${filter}`}
        page={page}
        total={total}
        perPage={INQUIRIES_PER_PAGE}
      />
    </main>
  );
}
