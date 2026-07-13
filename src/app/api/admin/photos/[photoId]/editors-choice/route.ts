import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { toggleEditorsChoice } from '@/lib/feeds';
import { handleRoute, jsonError } from '@/lib/errors';

export function POST(_req: Request, { params }: { params: Promise<{ photoId: string }> }) {
  return handleRoute(async () => {
    if (!(await requireAdmin())) return jsonError('forbidden', 403);
    const { photoId } = await params;
    return NextResponse.json(await toggleEditorsChoice(photoId));
  });
}
