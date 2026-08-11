import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { dialogsFor } from '@/lib/messages';
import { ru } from '@/i18n/ru';
import { EmptyState } from '@/components/EmptyState';

export const metadata: Metadata = { title: ru.messages.title };
export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');

  const dialogs = await dialogsFor(session.userId);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="t-h2">{ru.messages.title}</h1>
      {dialogs.length === 0 ? (
        <EmptyState
          icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 5h16v11H8l-4 4V5z" /></svg>}
          title={ru.messages.empty}
          subtitle={ru.messages.emptySubtitle}
          action={{ href: '/ru/russia', label: ru.messages.emptyAction }}
        />
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {dialogs.map((d) => (
            <li key={d.peer.id}>
              <Link href={`/ru/messages/${d.peer.id}`} className="flex items-baseline justify-between gap-3 card p-4">
                <span className="font-medium">
                  {d.peer.firstName} {d.peer.lastName}
                  {d.unread > 0 && (
                    <span className="ml-2 rounded-full bg-foreground px-2 py-0.5 text-xs text-background">
                      {ru.messages.unread(d.unread)}
                    </span>
                  )}
                </span>
                <span className="line-clamp-1 text-sm muted">{d.last.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
