import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { ru } from '@/i18n/ru';

// Отписка по ссылке из письма — БЕЗ входа в аккаунт (аудит 2026-07-31, P1).
// Требовать логин, чтобы перестать получать письма, нельзя: человек может не
// помнить пароль, а поток писем продолжается. Токен одноразовый по смыслу —
// он лишь отключает канал и ничего больше не открывает.
export const metadata: Metadata = { title: ru.unsubscribe.title };
export const dynamic = 'force-dynamic';

export default async function UnsubscribePage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await props.searchParams;
  let ok = false;

  if (token) {
    const { count } = await db.user.updateMany({
      where: { unsubToken: token },
      data: { notifyInquiriesEmail: false },
    });
    ok = count > 0;
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
      <h1 className="t-h1">{ok ? ru.unsubscribe.okTitle : ru.unsubscribe.failTitle}</h1>
      <p className="mt-3 text-sm muted">{ok ? ru.unsubscribe.okText : ru.unsubscribe.failText}</p>
      <Link href="/ru/cabinet/settings" className="btn btn-outline mt-6 inline-block px-5 py-2.5">
        {ru.unsubscribe.toSettings}
      </Link>
    </main>
  );
}
