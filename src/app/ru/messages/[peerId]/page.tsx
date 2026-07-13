import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { threadWith } from '@/lib/messages';
import { ru } from '@/i18n/ru';
import { ThreadClient } from './ThreadClient';

export const metadata: Metadata = { title: ru.messages.title };
export const dynamic = 'force-dynamic';

export default async function ThreadPage({ params }: { params: Promise<{ peerId: string }> }) {
  const session = await getSession();
  if (!session) redirect('/ru/login');

  const { peerId } = await params;
  const peer = await db.user.findUnique({
    where: { id: peerId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!peer) notFound();

  const messages = await threadWith(session.userId, peerId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">
        {ru.messages.writeTo(`${peer.firstName} ${peer.lastName}`)}
      </h1>
      <ThreadClient
        peerId={peer.id}
        selfId={session.userId}
        initial={messages.map((m) => ({
          id: m.id,
          senderId: m.senderId,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
