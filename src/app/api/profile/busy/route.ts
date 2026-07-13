import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

// Календарь занятости фотографа: список и toggle занятых дат
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const profile = await db.photographerProfile.findUnique({ where: { userId: session.userId } });
  if (!profile) return NextResponse.json({ error: 'no_profile' }, { status: 409 });

  const busy = await db.busyDate.findMany({
    where: { profileId: profile.id, date: { gte: new Date() } },
    orderBy: { date: 'asc' },
  });
  return NextResponse.json({ dates: busy.map((b) => b.date.toISOString().slice(0, 10)) });
}

const ToggleSchema = z.object({ date: z.iso.date() });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const profile = await db.photographerProfile.findUnique({ where: { userId: session.userId } });
  if (!profile) return NextResponse.json({ error: 'no_profile' }, { status: 409 });

  const parsed = ToggleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'validation' }, { status: 400 });

  const date = new Date(`${parsed.data.date}T00:00:00Z`);
  const existing = await db.busyDate.findUnique({
    where: { profileId_date: { profileId: profile.id, date } },
  });
  if (existing) {
    await db.busyDate.delete({ where: { id: existing.id } });
    return NextResponse.json({ busy: false });
  }
  await db.busyDate.create({ data: { profileId: profile.id, date } });
  return NextResponse.json({ busy: true });
}
