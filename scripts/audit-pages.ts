import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import { db } from '@/lib/db';
import { findTextIssues, mediaRefs, visibleText } from '@/lib/page-audit';

/**
 * Автоаудитор выдач (S2): обходит живые страницы прод-сборки и ищет в них то,
 * что тесты поймать не могут, — следы недоделанной работы, дошедшие до экрана.
 *
 * Зачем отдельно от e2e: юнит проверяет функцию, e2e — сценарий, а сюда
 * попадают дефекты, которые видит только глаз на готовой странице. Английский
 * `APPROVED` вместо «одобрен», `undefined` в середине фразы, невыведенный ключ
 * словаря `profile.aboutTitle`, битая картинка — всё это рендерится молча, с
 * кодом 200, и обнаруживается оператором, а не сборкой. Именно так и вышло:
 * замечание «ты точно всё проверил?» стоило нескольких кругов ручной сверки.
 *
 * Что проверяется на каждой странице:
 *  1. ожидаемый HTTP-статус (soft-404 — отдельный класс ошибок, уже кусался);
 *  2. видимый текст — без плейсхолдеров, служебных enum и сырых ключей i18n;
 *  3. изображения и медиа со страницы реально отдаются.
 *
 * Скрипт сам поднимает `next start` на свободном порту: аудит смысленен только
 * на прод-сборке (в dev другой рендер и другие ошибки).
 */
const PORT = Number(process.env.AUDIT_PORT ?? 3111);
const BASE = `http://127.0.0.1:${PORT}`;

type Target = { path: string; expect?: number; label: string };

async function targets(): Promise<Target[]> {
  const profile = await db.photographerProfile.findFirst({
    where: { status: 'APPROVED' },
    select: { username: true, photos: { select: { id: true }, take: 1 }, stories: { select: { id: true }, take: 1 } },
    orderBy: { createdAt: 'asc' },
  });

  const list: Target[] = [
    { path: '/', label: 'главная' },
    { path: '/ru/russia/moscow', label: 'каталог города' },
    { path: '/ru/russia/moscow/sports', label: 'каталог жанра' },
    { path: '/ru/match', label: 'подбор' },
    { path: '/ru/community', label: 'сообщество' },
    { path: '/ru/journal', label: 'журнал' },
    { path: '/ru/pro', label: 'подписка' },
    { path: '/ru/login', label: 'вход' },
    { path: '/ru/register', label: 'регистрация' },
    { path: '/ru/inquiry', label: 'заявка заказчика' },
    { path: '/ru/search?q=%D0%BC%D0%BE%D1%81%D0%BA%D0%B2%D0%B0', label: 'поиск' },
    { path: '/ru/russia/nowhere', expect: 404, label: 'несуществующий город' },
    { path: '/ru/photographer/no-such-author', expect: 404, label: 'несуществующий автор' },
  ];

  const { LEGAL_DOCS } = await import('@/lib/legal-content');
  for (const doc of Object.keys(LEGAL_DOCS)) {
    list.push({ path: `/ru/legal/${doc}`, label: `юрдокумент «${doc}»` });
  }

  if (profile) {
    list.push({ path: `/ru/photographer/${profile.username}`, label: 'профиль автора' });
    list.push({ path: `/ru/photographer/${profile.username}/followers`, label: 'подписчики автора' });
    if (profile.photos[0]) list.push({ path: `/ru/photo/${profile.photos[0].id}`, label: 'страница кадра' });
    if (profile.stories[0]) list.push({ path: `/ru/story/${profile.stories[0].id}`, label: 'страница серии' });
  }
  return list;
}

async function waitReady(child: ChildProcess): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
    if (ok) return;
    if (child.exitCode !== null) throw new Error(`сервер завершился с кодом ${child.exitCode}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('сервер не поднялся за минуту');
}

async function auditPage(t: Target, problems: string[]): Promise<void> {
  const res = await fetch(`${BASE}${t.path}`, { redirect: 'manual' });
  const want = t.expect ?? 200;
  if (res.status !== want) {
    problems.push(`${t.label} (${t.path}): HTTP ${res.status}, ожидался ${want}`);
    if (res.status >= 500) return;
  }
  const html = await res.text();
  const text = visibleText(html);

  for (const issue of findTextIssues(text)) problems.push(`${t.label} (${t.path}): ${issue}`);

  if (want === 200 && text.trim().length < 120) {
    problems.push(`${t.label} (${t.path}): страница почти пустая (${text.trim().length} символов текста)`);
  }

  for (const url of mediaRefs(html).slice(0, 12)) {
    const head = await fetch(`${BASE}${url}`, { method: 'GET', headers: { Range: 'bytes=0-64' } }).catch(() => null);
    if (!head || head.status >= 400) {
      problems.push(`${t.label} (${t.path}): не отдаётся медиа ${url} (${head ? head.status : 'нет ответа'})`);
    }
  }
}

async function main() {
  const child = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const serverErrors: string[] = [];
  child.stderr?.on('data', (b: Buffer) => {
    const line = b.toString();
    // Next печатает «⨯» на ошибке рендера — она может не менять статус ответа
    // при стриминге, поэтому лог тоже часть аудита.
    if (line.includes('⨯')) serverErrors.push(line.trim().slice(0, 200));
  });

  const problems: string[] = [];
  try {
    await waitReady(child);
    for (const t of await targets()) {
      await auditPage(t, problems);
    }
  } finally {
    child.kill('SIGTERM');
  }

  for (const e of serverErrors) problems.push(`ошибка рендера на сервере: ${e}`);

  if (problems.length > 0) {
    console.error(`\n❌ Аудит выдач: ${problems.length} замечаний\n`);
    for (const p of problems) console.error(`  • ${p}`);
    process.exit(1);
  }
  console.log('✅ Аудит выдач: страницы чистые');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
