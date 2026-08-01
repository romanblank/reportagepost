import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { inAppNotifications, markNotificationsRead } from '@/lib/notifications';
import { ru } from '@/i18n/ru';
import { formatDateRu } from '@/lib/date-format';

export const metadata: Metadata = { title: ru.notifications.title };
export const dynamic = 'force-dynamic';

// Куда ведёт уведомление по типу
function hrefFor(type: string): string {
  if (type === 'notification.message.new') return '/ru/messages';
  return '/ru/cabinet'; // заявки/отзывы/подписки — в кабинет
}

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');

  const items = await inAppNotifications(session.userId);
  // Заход на страницу = прочитано (снимаем счётчик непрочитанного)
  await markNotificationsRead(session.userId);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-semibold sm:text-3xl">{ru.notifications.title}</h1>
      {items.length === 0 ? (
        <p className="mt-4 text-sm muted">{ru.notifications.empty}</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id}>
              <Link href={hrefFor(n.type)}
                className={`flex items-start justify-between gap-3 card p-4 ${n.readAt ? '' : 'border-accent/40'}`}>
                <span className="text-sm">
                  {!n.readAt && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" />}
                  {ru.notifications.templates[n.type] ?? n.type}
                </span>
                <span className="shrink-0 text-xs muted">{formatDateRu(n.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
