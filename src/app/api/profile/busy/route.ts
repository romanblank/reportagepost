import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { toggleBusyDate, listBusyDates } from '@/lib/availability';
import { handleRoute, jsonError } from '@/lib/errors';

// Календарь занятости фотографа: список и toggle занятых дат
export async function GET() {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const from = new Date(new Date().setUTCHours(0, 0, 0, 0));
    return NextResponse.json({ dates: await listBusyDates(session.userId, from) });
  });
}

const ToggleSchema = z.object({ date: z.iso.date() });

export async function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const parsed = ToggleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    const busy = await toggleBusyDate(session.userId, parsed.data.date);
    return NextResponse.json({ busy });
  });
}
