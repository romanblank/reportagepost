import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { STORY_MAX_PHOTOS, STORY_MIN_PHOTOS, createStory } from '@/lib/stories';
import { handleRoute, jsonError } from '@/lib/errors';

const CreateSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional(),
  categorySlug: z.string().trim(),
  photoIds: z.array(z.string()).min(STORY_MIN_PHOTOS).max(STORY_MAX_PHOTOS),
});

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    if (session.role !== 'PHOTOGRAPHER') return jsonError('photographers_only', 403);

    const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    const result = await createStory(session.userId, parsed.data);
    return NextResponse.json(result, { status: 201 });
  });
}
