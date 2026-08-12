import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { inAppNotifications, markNotificationsRead } from '@/lib/notifications';
import { ru } from '@/i18n/ru';
import { formatDateRu } from '@/lib/date-format';

export const metadata: Metadata = { title: ru.notifications.title };
export const dynamic = 'force-dynamic';

/**
 * Куда ведёт уведомление (аудит 2026-08-01, P2).
 *
 * Раньше всё, кроме сообщений, вело в общий кабинет — при том что payload часто
 * хранит и username, и storyId. Фотограф получал «новый отзыв», попадал в
 * кабинет, где отзывов нет (они живут на публичном профиле), и не отвечал;
 * оператор получал «заявка на подписку» без ссылки и искал человека руками.
 * Уведомление, не ведущее к объекту, перестаёт быть приводным ремнём к
 * действию — а значит перестаёт открываться вовсе.
 */
function hrefFor(type: string, payload: Record<string, unknown>): string {
  const str = (k: string) => (typeof payload[k] === 'string' ? (payload[k] as string) : null);

  switch (type) {
    case 'notification.message.new': {
      const peer = str('peerId');
      return peer ? `/ru/messages/${peer}` : '/ru/messages';
    }
    case 'notification.review.new': {
      const username = str('username');
      return username ? `/ru/photographer/${username}#reviews` : '/ru/cabinet';
    }
    case 'notification.profile.approved': {
      const username = str('username');
      return username ? `/ru/photographer/${username}` : '/ru/cabinet';
    }
    case 'notification.story.approved':
    case 'notification.story.rejected': {
      const storyId = str('storyId');
      return storyId ? `/ru/story/${storyId}` : '/ru/cabinet';
    }
    case 'notification.comment.new': {
      const storyId = str('storyId');
      if (storyId) return `/ru/story/${storyId}`;
      // Кадр открывается на странице автора — своей страницы кабинета у фото нет
      return '/ru/cabinet/portfolio';
    }
    case 'notification.photo.editors_choice':
      return '/ru/cabinet/portfolio';
    case 'notification.pro.requested': {
      const userId = str('userId');
      return userId ? `/ru/admin/photographers/${userId}` : '/ru/admin/photographers';
    }
    case 'notification.follow.new':
      return '/ru/cabinet';
    case 'notification.inquiry.new':
    default:
      return '/ru/cabinet#inquiries';
  }
}

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');

  const items = await inAppNotifications(session.userId);
  // Заход на страницу = прочитано. Компромисс осознанный: помечать по клику на
  // конкретное уведомление точнее, но тогда счётчик остаётся гореть у тех, кто
  // просмотрел список и ушёл. Список короткий и весь виден сразу.
  await markNotificationsRead(session.userId);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-10">
      <div className="max-w-2xl w-full">
      <h1 className="t-h2">{ru.notifications.title}</h1>
      {items.length === 0 ? (
        <p className="mt-4 t-small muted">{ru.notifications.empty}</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id}>
              <Link href={hrefFor(n.type, n.payload)}
                className={`flex items-start justify-between gap-3 card p-4 ${n.readAt ? '' : 'border-accent/40'}`}>
                <span className="t-small">
                  {!n.readAt && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" />}
                  {ru.notifications.templates[n.type] ?? n.type}
                </span>
                <span className="shrink-0 t-fine muted">{formatDateRu(n.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      </div>
    </main>
  );
}
