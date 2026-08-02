import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';
import { processAndStoreAvatar } from '@/lib/photos';

/**
 * Аватары демонстрационным авторам — с учётом пола.
 *
 * Без аватаров на карточках висят инициалы: платформа про людей, а людей не
 * видно. Портреты раскладываются по полу автора: перепутанный пол читается
 * как небрежность и сразу подрывает доверие к витрине.
 *
 * Пол определяется по имени — для демо-набора этого достаточно, список имён
 * закрытый и известен.
 */
const DIR = process.env.AVATARS_DIR ?? '/tmp/rp-shots/av';

const FEMALE_NAMES = new Set([
  'Мария', 'Нина', 'Ольга', 'Дарья', 'Вера', 'Анна', 'Ирина', 'Елена', 'Светлана', 'Екатерина',
]);

function isFemale(firstName: string, lastName: string): boolean {
  if (FEMALE_NAMES.has(firstName)) return true;
  // Женские фамилии в русском почти всегда на -а/-я (Кадрова, Светова)
  return /(ова|ева|ина|ая|ская)$/i.test(lastName);
}

async function main() {
  const men = (await readdir(path.join(DIR, 'men'))).filter((f) => f.endsWith('.jpg')).sort();
  const women = (await readdir(path.join(DIR, 'women'))).filter((f) => f.endsWith('.jpg')).sort();

  const profiles = await db.photographerProfile.findMany({
    where: { username: { startsWith: 'futazh-' } },
    orderBy: { username: 'asc' },
    select: { id: true, username: true, user: { select: { firstName: true, lastName: true } } },
  });

  let m = 0;
  let w = 0;
  for (const p of profiles) {
    const female = isFemale(p.user.firstName, p.user.lastName);
    const pool = female ? women : men;
    const sub = female ? 'women' : 'men';
    const file = pool[(female ? w++ : m++) % pool.length];
    const buf = await readFile(path.join(DIR, sub, file));
    const key = await processAndStoreAvatar(buf, p.id);
    await db.photographerProfile.update({ where: { id: p.id }, data: { avatarKey: key } });
    console.log(`  ✓ ${p.user.firstName} ${p.user.lastName} → ${female ? 'ж' : 'м'}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
