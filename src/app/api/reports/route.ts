import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { createReport } from '@/lib/reports';
import { handleRoute } from '@/lib/errors';
import { clientIp, rateLimit } from '@/lib/rate-limit';

// Приём жалоб (аудит 2026-07-31, P0). Доступно и гостю — специально: жалоба
// правообладателя на украденный кадр приходит от человека без аккаунта, и
// заставлять его регистрироваться, чтобы сообщить о нарушении, неправильно.
// Гостю обязателен контакт для ответа и действует более жёсткий лимит.
const ReportSchema = z.object({
  targetType: z.enum(['USER', 'PHOTO', 'STORY', 'REVIEW', 'COMMENT', 'MESSAGE', 'FORUM_POST']),
  targetId: z.string().trim().min(1).max(64),
  reason: z.enum(['SPAM', 'ABUSE', 'ADULT', 'COPYRIGHT', 'PERSONAL_DATA', 'FRAUD', 'OTHER']),
  comment: z.string().trim().max(2000).optional(),
  contactEmail: z.string().trim().toLowerCase().email().max(200).optional(),
});

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    const parsed = ReportSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    if (session) {
      await rateLimit(`report:user:${session.userId}`, 20, 86400);
    } else {
      await rateLimit(`report:ip:${clientIp(req)}`, 5, 86400);
      if (!parsed.data.contactEmail) {
        return NextResponse.json({ error: 'contact_required' }, { status: 400 });
      }
    }
    const r = await createReport({
      reporterId: session?.userId ?? null,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
      comment: parsed.data.comment,
      contactEmail: parsed.data.contactEmail,
    });
    return NextResponse.json({ id: r.id }, { status: 201 });
  });
}
