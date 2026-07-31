import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { revealPhone } from '@/lib/phone-reveal';
import { handleRoute } from '@/lib/errors';
import { clientIp, rateLimit } from '@/lib/rate-limit';

// «Показать номер»: раскрытие кликом (телефона нет в SSR-разметке — спам-ботам
// нечего парсить). Доступно и гостю (лид дороже логин-стены), но с rate-limit
// по IP — массовый сбор номеров скриптом упирается в лимит.
export function POST(req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) await rateLimit(`phone-reveal:${clientIp(req)}`, 20, 3600);
    const { profileId } = await params;
    return NextResponse.json(await revealPhone(profileId, session?.userId ?? null));
  });
}
