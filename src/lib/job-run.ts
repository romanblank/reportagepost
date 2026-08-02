import { db } from '@/lib/db';

/**
 * Отметка о прогоне фоновой задачи.
 *
 * Без неё «задача не отработала» узнаётся только по последствиям: бэкапы уже
 * однажды не делались пять ночей подряд, и об этом никто не знал, пока не
 * понадобилось восстановление. Отметка ставится в начале и закрывается в
 * конце — незакрытая запись сама по себе сигнал, что прогон оборвался.
 */
export async function startJobRun(name: string): Promise<string> {
  const run = await db.jobRun.create({ data: { name } });
  return run.id;
}

export async function finishJobRun(
  id: string,
  ok: boolean,
  note?: string,
): Promise<void> {
  const run = await db.jobRun.findUnique({ where: { id }, select: { startedAt: true } });
  await db.jobRun.update({
    where: { id },
    data: {
      finishedAt: new Date(),
      ok,
      // Заметка коротко и без ПДн: её читает оператор в панели
      note: note?.slice(0, 200) ?? null,
      tookMs: run ? Date.now() - run.startedAt.getTime() : null,
    },
  });
}

/** Чистка истории прогонов: держим последние 30 дней, этого хватает для картины. */
export async function pruneJobRuns(): Promise<number> {
  const { count } = await db.jobRun.deleteMany({
    where: { startedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
  });
  return count;
}
