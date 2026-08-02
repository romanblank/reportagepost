import 'dotenv/config';
import { db } from '@/lib/db';
import { grantFoundingSub } from '@/lib/subscription';

// Раздаём подписки части демо-профилей: без них не видно ни цен в каталоге,
// ни бейджей уровня, ни полки «Открыты для новых заказов», ни расширенных
// полей профиля (техника). Нужны все три состояния — FREE, Active, Active+.
const PLAN: Record<string, 'PRIME' | 'ELITE'> = {
  'futazh-business-events-0': 'ELITE',
  'futazh-concerts-festivals-0': 'ELITE',
  'futazh-corporate-0': 'PRIME',
  'futazh-sports-0': 'PRIME',
  'futazh-street-city-0': 'PRIME',
  'futazh-private-events-1': 'PRIME',
};

async function main() {
  for (const [username, tier] of Object.entries(PLAN)) {
    const p = await db.photographerProfile.findUnique({ where: { username }, select: { userId: true } });
    if (!p) continue;
    await grantFoundingSub(p.userId, 'moscow', tier);
    console.log(`  ✓ ${username} → ${tier}`);
  }
  const { reconcileSubRanks } = await import('@/lib/subscription');
  console.log('исправлено рангов:', await reconcileSubRanks());
}
main().catch(console.error).finally(() => db.$disconnect());
