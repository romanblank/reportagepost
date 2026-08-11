import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { threadWith } from '@/lib/messages';
import { ru } from '@/i18n/ru';
import { ThreadClient } from './ThreadClient';
import { MarkShootButton } from '@/components/MarkShootButton';
import { BlockButton } from '@/components/BlockButton';
import { ReportButton } from '@/components/ReportButton';
import { db as _db } from '@/lib/db';

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
  // Блокировка/жалоба на собеседника (аудит P0: инструментов модерации людей не было)
  const myBlock = await _db.userBlock.findUnique({
    where: { blockerId_blockedId: { blockerId: session.userId, blockedId: peerId } },
    select: { blockerId: true },
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="t-title">
          {ru.messages.writeTo(`${peer.firstName} ${peer.lastName}`)}
        </h1>
        <span className="flex flex-wrap items-center gap-3">
          {/* Отметить съёмку может только автор и только в переписке с
              заказчиком: там, где он и вспоминает о состоявшейся работе */}
          {session.role === 'PHOTOGRAPHER' && <MarkShootButton clientUserId={peer.id} />}
          <BlockButton userId={peer.id} initialBlocked={Boolean(myBlock)} />
          <ReportButton targetType="USER" targetId={peer.id} authed />
        </span>
      </div>
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
