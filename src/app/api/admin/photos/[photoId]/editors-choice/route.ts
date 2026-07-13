import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { toggleEditorsChoice } from '@/lib/feeds';

export async function POST(_req: Request, { params }: { params: Promise<{ photoId: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { photoId } = await params;
  try {
    return NextResponse.json(await toggleEditorsChoice(photoId));
  } catch {
    return NextResponse.json({ error: 'photo_not_found' }, { status: 404 });
  }
}
