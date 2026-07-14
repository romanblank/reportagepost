import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { handleRoute, DomainError, jsonError } from '@/lib/errors';
import { addComment, deleteComment, COMMENT_MAX } from '@/lib/comments';

const createSchema = z
  .object({
    photoId: z.string().min(1).optional(),
    storyId: z.string().min(1).optional(),
    body: z.string().min(1).max(COMMENT_MAX * 2), // финальный guard — в comments.ts
  })
  .refine((d) => Boolean(d.photoId) !== Boolean(d.storyId), { message: 'exactly one target' });

export async function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new DomainError('validation', 400);

    const target = parsed.data.photoId
      ? { photoId: parsed.data.photoId }
      : { storyId: parsed.data.storyId! };
    const comment = await addComment(session.userId, target, parsed.data.body);
    return NextResponse.json({ id: comment.id }, { status: 201 });
  });
}

const deleteSchema = z.object({ commentId: z.string().min(1) });

export async function DELETE(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new DomainError('validation', 400);

    await deleteComment(session.userId, parsed.data.commentId, session.role === 'ADMIN');
    return NextResponse.json({ ok: true });
  });
}
