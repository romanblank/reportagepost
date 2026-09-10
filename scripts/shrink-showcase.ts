import 'dotenv/config';
import { db } from '@/lib/db';

/**
 * Сворачивает демо-витрину до N профилей К БЕТЕ (чек-лист техлида,
 * оценка 2026-09-10): двенадцать плиток «Пример» рядом с двадцатью живыми
 * авторами читаются искушённым фотографом мгновенно — платформа выглядит
 * манекеном. Полное удаление демо — отдельный шаг S4 (`drop-showcase.ts`);
 * здесь мягкий вариант для беты: лишние демо ПРЯЧУТСЯ (unpublish, DRAFT),
 * а не удаляются — файлы и данные остаются, вернуть можно одной командой.
 *
 * Запуск: npx tsx scripts/shrink-showcase.ts 4        — оставить 4 видимых
 *         npx tsx scripts/shrink-showcase.ts restore  — вернуть все
 * Прод — через workflow Prod ops / ssh (локальный запуск бьёт в dev-базу).
 * Оставляются профили с наибольшим числом кадров — по одному на разные жанры.
 */
const PREFIX = 'futazh-';

async function main() {
  const arg = process.argv[2];
  if (arg === 'restore') {
    const { count } = await db.photographerProfile.updateMany({
      where: { username: { startsWith: PREFIX }, status: 'DRAFT' },
      data: { status: 'APPROVED' },
    });
    console.log(`Возвращено в каталог демо-профилей: ${count}`);
    return;
  }

  const keep = Number(arg);
  if (!Number.isInteger(keep) || keep < 0 || keep > 12) {
    console.error('Использование: shrink-showcase.ts <N 0..12> | restore');
    process.exit(1);
  }

  const demos = await db.photographerProfile.findMany({
    where: { username: { startsWith: PREFIX }, status: 'APPROVED' },
    select: {
      id: true,
      username: true,
      categories: { select: { categoryId: true }, take: 1 },
      _count: { select: { photos: true } },
    },
    orderBy: { username: 'asc' },
  });
  if (demos.length <= keep) {
    console.log(`Видимых демо ${demos.length} — сворачивать нечего (порог ${keep}).`);
    return;
  }

  // Разнообразие жанров важнее числа кадров: по одному из каждого жанра,
  // внутри жанра — с бóльшим портфолио
  const byCat = new Map<string, typeof demos>();
  for (const d of demos) {
    const cat = d.categories[0]?.categoryId ?? '—';
    const list = byCat.get(cat) ?? [];
    list.push(d);
    byCat.set(cat, list);
  }
  const kept: string[] = [];
  outer: for (;;) {
    for (const list of byCat.values()) {
      const next = list
        .filter((d) => !kept.includes(d.id))
        .sort((a, b) => b._count.photos - a._count.photos)[0];
      if (next) {
        kept.push(next.id);
        if (kept.length >= keep) break outer;
      }
    }
    if (kept.length >= Math.min(keep, demos.length)) break;
  }

  const hideIds = demos.filter((d) => !kept.includes(d.id)).map((d) => d.id);
  const { count } = await db.photographerProfile.updateMany({
    where: { id: { in: hideIds } },
    data: { status: 'DRAFT' },
  });
  console.log(`Скрыто демо-профилей: ${count}; осталось видимых: ${kept.length}`);
  console.log('Вернуть всё: npx tsx scripts/shrink-showcase.ts restore');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
