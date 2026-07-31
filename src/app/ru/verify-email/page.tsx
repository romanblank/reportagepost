import type { Metadata } from 'next';
import Link from 'next/link';
import { confirmEmail } from '@/lib/email-verification';
import { ru } from '@/i18n/ru';

// Страница перехода по ссылке из письма. Подтверждаем на сервере сразу —
// пользователю не нужно ничего нажимать (ссылка и есть намерение).
export const metadata: Metadata = { title: ru.auth.emailVerify.okTitle };
export const dynamic = 'force-dynamic';

export default async function VerifyEmailPage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await props.searchParams;
  let ok = false;
  if (token) {
    ok = await confirmEmail(token).then(() => true).catch(() => false);
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
      <h1 className="t-h1">{ok ? ru.auth.emailVerify.okTitle : ru.auth.emailVerify.failTitle}</h1>
      <p className="mt-3 text-sm muted">
        {ok ? ru.auth.emailVerify.okText : ru.auth.emailVerify.failText}
      </p>
      <Link href="/ru/cabinet" className="btn btn-accent mt-6 inline-block px-5 py-2.5">
        {ru.auth.emailVerify.toCabinet}
      </Link>
    </main>
  );
}
