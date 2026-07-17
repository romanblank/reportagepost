import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { YANDEX_PENDING_COOKIE, verifyYandexPendingToken } from '@/lib/auth';
import { ru } from '@/i18n/ru';
import { RoleChoiceForm } from '@/components/RoleChoiceForm';

export const metadata: Metadata = { title: ru.auth.roleTitle };
export const dynamic = 'force-dynamic';

// Выбор роли для нового пользователя из Яндекса. Профиль — в подписанном
// pending-cookie; нет его → возврат на вход.
export default async function RolePage() {
  const jar = await cookies();
  const token = jar.get(YANDEX_PENDING_COOKIE)?.value;
  const profile = token ? await verifyYandexPendingToken(token) : null;
  if (!profile) redirect('/ru/login');

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <p className="t-caption text-recognition">{ru.landing.kicker}</p>
      <h1 className="t-h1 mt-3">{ru.auth.roleTitle}</h1>
      <p className="mt-2 t-body muted">{ru.auth.roleLead(profile.firstName)}</p>
      <RoleChoiceForm />
    </main>
  );
}
