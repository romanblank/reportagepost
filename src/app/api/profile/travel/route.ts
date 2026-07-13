import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { addTravelPlan, removeTravelPlan, travelPlansFor } from '@/lib/travel';
import { handleRoute, jsonError } from '@/lib/errors';

export function GET() {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const plans = await travelPlansFor(session.userId);
    return NextResponse.json({
      plans: plans.map((p) => ({
        id: p.id,
        citySlug: p.city.slug,
        fromDate: p.fromDate.toISOString().slice(0, 10),
        toDate: p.toDate.toISOString().slice(0, 10),
      })),
    });
  });
}

const AddSchema = z.object({
  citySlug: z.string().trim(),
  fromDate: z.iso.date(),
  toDate: z.iso.date(),
});

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const parsed = AddSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);
    return NextResponse.json(await addTravelPlan(session.userId, parsed.data), { status: 201 });
  });
}

const DelSchema = z.object({ id: z.string() });

export function DELETE(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const parsed = DelSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);
    await removeTravelPlan(session.userId, parsed.data.id);
    return NextResponse.json({ ok: true });
  });
}
