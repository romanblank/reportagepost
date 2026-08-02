import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';
import { storePhotoVariants, analyzePhoto } from '@/lib/photos';
import { storeVideoStream } from '@/lib/videos';
import { Readable } from 'node:stream';
import { brandsFromCameras } from '@/lib/gear-brands';
import { recomputeRatings } from '@/lib/rating';

/**
 * Наполнение витрины реальным содержимым (запуск: npx tsx scripts/seed-showcase.ts).
 *
 * Зачем: пустые профили не позволяют ни оператору, ни мне увидеть разделы,
 * которые появляются только при данных — статистику, технику, календарь,
 * подтверждённые съёмки, признательность заказчиков, видео. На градиентных
 * заглушках нельзя оценить ни композицию, ни типографику: они одинаковые.
 *
 * Что делает: берёт кадры и ролики из каталога (по умолчанию /tmp/rp-shots,
 * имена вида «жанр-xxx.jpg»), раскладывает по профилям соответствующего жанра,
 * заполняет анкеты целиком, заводит заказчиков с перепиской, подтверждёнными
 * съёмками и отзывами, ставит занятость и лайки, пересчитывает рейтинги.
 *
 * Идемпотентность: повторный запуск не плодит дубли — фото сверяются по
 * perceptual-hash (как при обычной загрузке), остальное обновляется upsert-ом.
 * Скрипт трогает ТОЛЬКО демонстрационные профили (futazh-*): реальные аккаунты
 * беты не затрагиваются.
 */

const SHOTS_DIR = process.env.SHOWCASE_DIR ?? '/tmp/rp-shots';

/** Жанр в имени файла → слаг категории в базе */
const GENRE_BY_PREFIX: Record<string, string> = {
  concerts: 'concerts-festivals',
  sports: 'sports',
  business: 'business-events',
  corporate: 'corporate',
  city: 'street-city',
  private: 'private-events',
};

/** Живые анкеты: у каждого автора свой голос, техника и цены */
const PROFILES: Record<string, {
  bio: string;
  experienceYears: number;
  languages: string[];
  cameras: string[];
  lenses: string[];
  lighting: string[];
  teamInfo: string;
  doesVideo: boolean;
  packages: { hours: number; priceRub: number }[];
  faq: { q: string; a: string }[];
}> = {
  'futazh-concerts-festivals-0': {
    bio: 'Снимаю концерты и фестивали двенадцатый год. Работаю в зале и в пите, без вспышки — сцена даёт свой свет, задача не испортить его. Отдаю отобранный материал за 3–5 дней, срочные кадры для соцсетей — в ту же ночь.',
    experienceYears: 12,
    languages: ['ru', 'en'],
    cameras: ['Sony A9 III', 'Sony A7S III'],
    lenses: ['24-70/2.8 GM II', '70-200/2.8 GM II', '35/1.4 GM'],
    lighting: ['Godox V1 (репортаж за кулисами)'],
    teamInfo: 'Работаю один; на больших фестивалях беру второго фотографа.',
    doesVideo: true,
    packages: [
      { hours: 3, priceRub: 18000 },
      { hours: 6, priceRub: 32000 },
      { hours: 12, priceRub: 55000 },
    ],
    faq: [
      { q: 'Снимаете из фотопита?', a: 'Да, если организатор даёт аккредитацию. Первые три песни — стандарт, дальше по договорённости.' },
      { q: 'Как быстро отдаёте материал?', a: 'Отобранное — за 3–5 дней. Пять-семь кадров для соцсетей отправляю в ночь после концерта.' },
    ],
  },
  'futazh-concerts-festivals-1': {
    bio: 'Фестивальный репортаж: сцена, бэкстейдж, публика. Люблю снимать не только артиста, но и зал — по этим кадрам потом видно, каким событие было на самом деле.',
    experienceYears: 8,
    languages: ['ru'],
    cameras: ['Canon R5 Mark II', 'Canon R6'],
    lenses: ['RF 28-70/2', 'RF 70-200/2.8', 'RF 15-35/2.8'],
    lighting: ['Profoto A10'],
    teamInfo: 'Пара: я и ассистент по свету.',
    doesVideo: true,
    packages: [
      { hours: 4, priceRub: 22000 },
      { hours: 8, priceRub: 40000 },
    ],
    faq: [
      { q: 'Работаете в других городах?', a: 'Да, выезжаю. Дорога и проживание — отдельно, съёмка по тем же ставкам.' },
    ],
  },
  'futazh-sports-0': {
    bio: 'Спортивный репортаж: игровые виды, единоборства, марафоны. Снимаю на длинном фокусе с двух точек, отдаю кадры с эмоцией, а не только с моментом гола.',
    experienceYears: 11,
    languages: ['ru', 'en'],
    cameras: ['Nikon Z9', 'Nikon Z8'],
    lenses: ['70-200/2.8 S', '400/2.8 TC', '24-70/2.8 S'],
    lighting: [],
    teamInfo: 'Один; на турнирах работаю в паре с видеооператором.',
    doesVideo: true,
    packages: [
      { hours: 2, priceRub: 14000 },
      { hours: 5, priceRub: 30000 },
    ],
    faq: [
      { q: 'Успеваете отдать в день матча?', a: 'Да, 20–30 кадров отправляю в течение двух часов после финального свистка.' },
      { q: 'Снимаете детский спорт?', a: 'Снимаю. С родителями заранее согласуем, что публикуем, а что отдаём только семье.' },
    ],
  },
  'futazh-sports-1': {
    bio: 'Бег, вело, триатлон. Знаю, где на трассе получится кадр, а где спортсмен просто пробежит мимо. Работаю в дождь и в снег — техника защищённая.',
    experienceYears: 6,
    languages: ['ru'],
    cameras: ['Sony A7 IV', 'Sony A6700'],
    lenses: ['70-200/2.8 GM II', '24-105/4 G'],
    lighting: [],
    teamInfo: 'Работаю один.',
    doesVideo: true,
    packages: [{ hours: 4, priceRub: 19000 }],
    faq: [{ q: 'Как ищете участника в толпе?', a: 'По стартовому номеру и цвету формы — пришлите заранее, найду на дистанции.' }],
  },
  'futazh-business-events-0': {
    bio: 'Конференции, форумы, деловые сессии. Снимаю так, чтобы материал годился и для отчёта, и для пресс-релиза: спикер, зал, детали, кулуары. Обрабатываю единым грейдом, чтобы галерея выглядела цельно.',
    experienceYears: 14,
    languages: ['ru', 'en'],
    cameras: ['Sony A1', 'Sony A7 IV'],
    lenses: ['24-70/2.8 GM II', '70-200/2.8 GM II', '85/1.4 GM'],
    lighting: ['Godox AD200 Pro ×2', 'постоянный LED для интервью'],
    teamInfo: 'Работаю с ассистентом, на многозальных форумах — второй фотограф.',
    doesVideo: true,
    packages: [
      { hours: 4, priceRub: 28000 },
      { hours: 8, priceRub: 48000 },
      { hours: 16, priceRub: 85000 },
    ],
    faq: [
      { q: 'Нужен ли вам список ключевых лиц?', a: 'Обязательно. Пришлите фамилии и фото — так никто из важных гостей не потеряется.' },
      { q: 'Работаете по NDA?', a: 'Да, подписываю. Материал не публикую без письменного согласования.' },
    ],
  },
  'futazh-business-events-1': {
    bio: 'Деловая съёмка без пафоса: люди в работе, живые лица, честный свет. Двенадцать лет снимаю форумы и отраслевые конференции.',
    experienceYears: 12,
    languages: ['ru', 'en', 'de'],
    cameras: ['Fujifilm X-H2S', 'Fujifilm X-T5'],
    lenses: ['XF 16-55/2.8', 'XF 50-140/2.8', 'XF 23/1.4'],
    lighting: ['Godox V1 ×2'],
    teamInfo: 'Один или в паре — по масштабу площадки.',
    doesVideo: true,
    packages: [
      { hours: 3, priceRub: 21000 },
      { hours: 6, priceRub: 38000 },
    ],
    faq: [{ q: 'Отдаёте исходники?', a: 'Отдаю отобранное с обработкой. Исходники — по отдельной договорённости.' }],
  },
  'futazh-corporate-0': {
    bio: 'Корпоративы, юбилеи компаний, тимбилдинги. Снимаю репортажем: без постановок и «а теперь все посмотрели в камеру». Люди узнают себя настоящими.',
    experienceYears: 9,
    languages: ['ru'],
    cameras: ['Canon R6 Mark II', 'Canon R8'],
    lenses: ['RF 24-70/2.8', 'RF 35/1.8', 'RF 85/2'],
    lighting: ['Godox AD200 Pro', 'Godox V1'],
    teamInfo: 'Работаю один, при 200+ гостях беру напарника.',
    doesVideo: true,
    packages: [
      { hours: 4, priceRub: 24000 },
      { hours: 8, priceRub: 42000 },
    ],
    faq: [
      { q: 'Делаете фотозону?', a: 'Делаю, если нужно: приношу свет и фон, но основное время работаю репортажем.' },
      { q: 'Когда будут фото?', a: 'Через 5–7 дней. Двадцать кадров для внутренней рассылки — на следующий день.' },
    ],
  },
  'futazh-corporate-1': {
    bio: 'Снимаю корпоративные события десять лет. Знаю, что нужно HR для внутренних каналов, а что — маркетингу для сайта, и отдаю два разных набора.',
    experienceYears: 10,
    languages: ['ru', 'en'],
    cameras: ['Sony A7 IV', 'Sony A7C'],
    lenses: ['24-70/2.8 GM II', '35/1.4 GM', '85/1.8'],
    lighting: ['Godox AD300 Pro', 'два LED-панели'],
    teamInfo: 'Пара: фотограф и ассистент.',
    doesVideo: true,
    packages: [
      { hours: 5, priceRub: 27000 },
      { hours: 10, priceRub: 50000 },
    ],
    faq: [{ q: 'Согласуете кадры перед публикацией?', a: 'Да, отдаю галерею на согласование до любых публикаций.' }],
  },
  'futazh-private-events-0': {
    bio: 'Дни рождения, семейные праздники, крестины. Работаю тихо и не мешаю: гости обычно замечают камеру только на общем кадре.',
    experienceYears: 7,
    languages: ['ru'],
    cameras: ['Sony A7 III', 'Sony A7C'],
    lenses: ['35/1.4 GM', '85/1.8', '24-70/2.8'],
    lighting: ['Godox V1'],
    teamInfo: 'Работаю один.',
    doesVideo: true,
    packages: [
      { hours: 3, priceRub: 16000 },
      { hours: 6, priceRub: 29000 },
    ],
    faq: [{ q: 'Снимаете детские праздники?', a: 'Да, часто. Приезжаю заранее, чтобы дети привыкли ко мне до начала.' }],
  },
  'futazh-private-events-1': {
    bio: 'Частные события и небольшие торжества. Люблю живой свет и естественные сцены: стол, разговоры, руки, детали — из этого складывается память о вечере.',
    experienceYears: 5,
    languages: ['ru', 'en'],
    cameras: ['Fujifilm X-T5'],
    lenses: ['XF 23/1.4', 'XF 56/1.2', 'XF 16-55/2.8'],
    lighting: ['Godox V1'],
    teamInfo: 'Работаю один.',
    doesVideo: true,
    packages: [{ hours: 4, priceRub: 18000 }],
    faq: [{ q: 'Приедете за город?', a: 'Приеду. В пределах 100 км от Москвы дорога включена в стоимость.' }],
  },
  'futazh-street-city-0': {
    bio: 'Городской репортаж: улица, транспорт, люди в потоке. Снимаю для медиа и городских проектов, работаю сериями — один кадр редко рассказывает историю целиком.',
    experienceYears: 13,
    languages: ['ru', 'en'],
    cameras: ['Leica Q3', 'Sony A7 IV'],
    lenses: ['28/1.7 (фикс)', '35/1.4 GM'],
    lighting: [],
    teamInfo: 'Работаю один.',
    doesVideo: true,
    packages: [
      { hours: 4, priceRub: 20000 },
      { hours: 8, priceRub: 36000 },
    ],
    faq: [
      { q: 'Можно ли снимать людей на улице?', a: 'Для редакционных целей — да. Для рекламы беру письменное согласие у каждого узнаваемого человека.' },
    ],
  },
  'futazh-street-city-1': {
    bio: 'Уличная и городская съёмка. Хожу пешком, снимаю на один фикс — так кадр строится ногами, а не зумом. Отдаю плёночный грейд, если он к месту.',
    experienceYears: 6,
    languages: ['ru'],
    cameras: ['Fujifilm X100VI'],
    lenses: ['23/2 (встроенный)'],
    lighting: [],
    teamInfo: 'Работаю один.',
    doesVideo: true,
    packages: [{ hours: 3, priceRub: 15000 }],
    faq: [{ q: 'Работаете ночью?', a: 'Да, ночной город — отдельная любовь. Съёмка с рук, без штатива.' }],
  },
};

/** Заказчики, от лица которых будут подтверждённые съёмки и отзывы */
const CLIENTS = [
  { first: 'Ирина', last: 'Мельникова', text: 'Поймал именно те моменты, ради которых зовёшь репортажника: живые лица, сцену, кулуары. Материал пришёл через неделю, отобран идеально. Уже зовём на следующий форум.' },
  { first: 'Дмитрий', last: 'Кравцов', text: 'Снимал наше событие два дня подряд, плюс смонтировал шоурил — отдали в тот же вечер для соцсетей. Профессионал, с которым спокойно.' },
  { first: 'Анна', last: 'Соболева', text: 'Работал незаметно, гости даже не обращали внимания на камеру. В галерее живые эмоции, а не постановка. Спасибо!' },
];

async function main() {
  const files = (await readdir(SHOTS_DIR)).filter((f) => f.endsWith('.jpg'));
  const videos = (await readdir(SHOTS_DIR)).filter((f) => f.startsWith('vid-') && f.endsWith('.mp4'));
  if (files.length === 0) {
    console.error(`Нет кадров в ${SHOTS_DIR}. Скачайте их перед запуском.`);
    process.exit(1);
  }

  // Кадры по жанрам
  const byGenre = new Map<string, string[]>();
  for (const f of files) {
    const prefix = f.split('-')[0];
    const slug = GENRE_BY_PREFIX[prefix];
    if (!slug) continue;
    byGenre.set(slug, [...(byGenre.get(slug) ?? []), f]);
  }

  const usernames = Object.keys(PROFILES);
  const profiles = await db.photographerProfile.findMany({
    where: { username: { in: usernames } },
    include: { categories: { include: { category: true } }, user: true },
  });
  console.log(`Профилей к наполнению: ${profiles.length}`);

  // Заказчики (переиспользуем между запусками)
  const clientIds: string[] = [];
  for (const c of CLIENTS) {
    const email = `showcase-${c.first.toLowerCase()}@demo.local`;
    const u = await db.user.upsert({
      where: { email },
      create: {
        email, role: 'CLIENT', status: 'ACTIVE',
        firstName: c.first, lastName: c.last,
        emailVerifiedAt: new Date(), // нужен для подтверждения съёмок
      },
      update: { emailVerifiedAt: new Date() },
    });
    clientIds.push(u.id);
  }

  let photosAdded = 0;
  let videosAdded = 0;

  // Замена заглушек: у демо-профилей лежат сгенерированные градиенты, на
  // которых нельзя оценить ни композицию, ни типографику — они одинаковые.
  // Флаг --replace убирает их перед заливкой настоящих кадров.
  if (process.argv.includes('--replace')) {
    const ids = profiles.map((p) => p.id);
    const old = await db.photo.findMany({
      where: { profileId: { in: ids }, storageKey: { contains: 'futazh-' } },
      select: { id: true },
    });
    if (old.length > 0) {
      const oldIds = old.map((o) => o.id);
      await db.like.deleteMany({ where: { photoId: { in: oldIds } } });
      await db.comment.deleteMany({ where: { photoId: { in: oldIds } } });
      await db.photographerProfile.updateMany({
        where: { coverPhotoId: { in: oldIds } }, data: { coverPhotoId: null },
      });
      await db.photo.deleteMany({ where: { id: { in: oldIds } } });
      console.log(`Убрано заглушек: ${oldIds.length}`);
    }
  }

  for (const [index, profile] of profiles.entries()) {
    const spec = PROFILES[profile.username];
    const genre = profile.categories[0]?.category.slug;
    const pool = genre ? (byGenre.get(genre) ?? []) : [];

    // 1) Анкета целиком
    await db.photographerProfile.update({
      where: { id: profile.id },
      data: {
        bio: spec.bio,
        experienceYears: spec.experienceYears,
        languages: spec.languages,
        cameras: spec.cameras,
        cameraBrands: brandsFromCameras(spec.cameras),
        lenses: spec.lenses,
        lighting: spec.lighting,
        teamInfo: spec.teamInfo,
        doesVideo: spec.doesVideo,
        showPhone: true,
        verified: index % 3 !== 2, // часть авторов без подтверждения — так честнее
        faq: spec.faq,
      },
    });
    // Телефон уникален в базе — генерируем заведомо непересекающийся номер
    // и не трогаем, если он уже стоит (повторный запуск скрипта).
    const phone = `+79${String(100000000 + index * 1234567).slice(0, 9)}`;
    const phoneTaken = await db.user.findFirst({
      where: { phone, NOT: { id: profile.userId } }, select: { id: true },
    });
    if (!phoneTaken) {
      await db.user.update({ where: { id: profile.userId }, data: { phone } });
    }

    // 2) Пакеты цен
    await db.pricePackage.deleteMany({ where: { profileId: profile.id } });
    await db.pricePackage.createMany({
      data: spec.packages.map((p, i) => ({
        profileId: profile.id, hours: p.hours, priceMinor: p.priceRub * 100,
        currency: 'RUB', sortOrder: i,
      })),
    });

    // 3) Кадры. Берём по 6 на профиль, чередуя, чтобы соседи не совпадали.
    const existing = await db.photo.count({ where: { profileId: profile.id, status: 'APPROVED' } });
    const need = Math.max(0, 6 - existing);
    const categoryId = profile.categories[0]?.categoryId;
    if (need > 0 && categoryId && pool.length > 0) {
      // Смещение по номеру профиля ВНУТРИ жанра: иначе соседи по жанру
      // разбирают одни и те же файлы, дедуп их отбрасывает, и у второго
      // автора страница остаётся пустой (так и вышло на первом прогоне).
      const sameGenre = profiles.filter((p) => p.categories[0]?.category.slug === genre);
      const genreIndex = Math.max(0, sameGenre.findIndex((p) => p.id === profile.id));
      // Идём по всему пулу жанра со сдвигом на номер автора внутри жанра и
      // пропускаем уже занятые кадры: раньше брались фиксированные индексы, и
      // при повторном запуске скрипт упирался в собственные же дубли.
      let added = 0;
      for (let step = 0; step < pool.length && added < need; step++) {
        const file = pool[(genreIndex * 6 + step) % pool.length];
        const buf = await readFile(path.join(SHOTS_DIR, file));
        const analyzed = await analyzePhoto(buf);
        const dup = await db.photo.findFirst({ where: { phash: analyzed.phash } });
        if (dup) continue; // кадр уже у кого-то — не дублируем
        const stored = await storePhotoVariants(buf);
        await db.photo.create({
          data: {
            profileId: profile.id, categoryId,
            storageKey: stored.storageKey,
            width: analyzed.width, height: analyzed.height,
            phash: analyzed.phash, blurhash: analyzed.blurData,
            status: 'APPROVED',
            publishedAt: new Date(Date.now() - (added + index) * 36e5 * 8),
            editorsChoiceAt: added === 0 && index % 4 === 0 ? new Date() : null,
          },
        });
        added++;
        photosAdded++;
      }
    }

    // 4) Обложка — первый кадр
    const first = await db.photo.findFirst({
      where: { profileId: profile.id, status: 'APPROVED' },
      orderBy: { publishedAt: 'asc' },
    });
    if (first) {
      await db.photographerProfile.update({ where: { id: profile.id }, data: { coverPhotoId: first.id } });
    }

    // 5) Видео — каждому автору свой ролик по его жанру.
    //    Раньше видео получали только те, у кого отмечено doesVideo, и раздел
    //    «Видео и шоурилы» на большинстве страниц не было видно вовсе.
    const hasVideo = await db.profileVideo.count({ where: { profileId: profile.id } });
    if (hasVideo === 0 && videos.length > 0) {
      const prefix = Object.entries(GENRE_BY_PREFIX).find(([, slug]) => slug === genre)?.[0];
      const file = videos.find((v) => prefix && v.includes(prefix)) ?? videos[index % videos.length];
      const buf = await readFile(path.join(SHOTS_DIR, file));
      const stored = await storeVideoStream(Readable.from(buf), 'video/mp4', buf.byteLength);
      const created = await db.profileVideo.create({
        data: {
          profileId: profile.id, storageKey: stored.storageKey, mimeType: 'video/mp4',
          sizeBytes: stored.sizeBytes, title: 'Шоурил · монтаж со съёмок', sortOrder: 0,
          status: 'APPROVED',
        },
      });
      videosAdded++;
      // Прогоняем через тот же пайплайн, что и загрузку автора: без web-вариантов
      // ролик не покажется на профиле (исходник наружу не отдаётся).
      const { processVideo } = await import('@/lib/video-pipeline');
      const res = await processVideo(created.id);
      if (!res.ok) console.warn(`  видео ${created.id}: ${res.reason}`);
      // Автор с роликом отмечается как снимающий видео — иначе бейдж в каталоге
      // разойдётся с содержимым страницы
      await db.photographerProfile.update({ where: { id: profile.id }, data: { doesVideo: true } });
    }

    // 6) Серия из трёх кадров — чтобы раздел «Серии» не пустовал
    const storyCount = await db.story.count({ where: { profileId: profile.id } });
    if (storyCount === 0 && categoryId) {
      const shots = await db.photo.findMany({
        where: { profileId: profile.id, status: 'APPROVED' }, take: 3, orderBy: { publishedAt: 'desc' },
      });
      if (shots.length >= 3) {
        const story = await db.story.create({
          data: {
            profileId: profile.id, categoryId,
            title: 'Съёмка целиком: как это было',
            description: 'Небольшая серия с одного события — от подготовки до финала. Так материал выглядит не отдельными удачными кадрами, а связным рассказом.',
            status: 'APPROVED', publishedAt: new Date(),
          },
        });
        await db.photo.updateMany({ where: { id: { in: shots.map((s) => s.id) } }, data: { storyId: story.id } });
      }
    }

    // 7) Занятость: несколько дат текущего месяца
    const now = new Date();
    for (const day of [5 + (index % 4), 12 + (index % 3), 19 + (index % 5)]) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
      await db.busyDate.upsert({
        where: { profileId_date: { profileId: profile.id, date } },
        create: { profileId: profile.id, date },
        update: {},
      });
    }

    // 8) Подтверждённые съёмки и отзывы — от разных заказчиков.
    //    Переписка нужна по гейту confirmShoot, съёмка подтверждается автором.
    const clientsForProfile = clientIds.slice(0, 1 + (index % CLIENTS.length));
    for (const [ci, clientId] of clientsForProfile.entries()) {
      const msgs = await db.message.count({
        where: { OR: [{ senderId: clientId, recipientId: profile.userId }, { senderId: profile.userId, recipientId: clientId }] },
      });
      if (msgs === 0) {
        await db.message.create({ data: { senderId: clientId, recipientId: profile.userId, body: 'Здравствуйте! Интересует съёмка события, расскажите про свободные даты.' } });
        await db.message.create({ data: { senderId: profile.userId, recipientId: clientId, body: 'Здравствуйте! Да, конечно — напишите дату и формат, обсудим детали.' } });
      }
      for (const monthsAgo of [1, 3]) {
        const eventDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 14));
        const exists = await db.shootConfirmation.findFirst({
          where: { clientUserId: clientId, profileId: profile.id, eventDate },
        });
        if (!exists) {
          await db.shootConfirmation.create({
            data: {
              clientUserId: clientId, profileId: profile.id, eventDate,
              state: 'CONFIRMED', respondedAt: new Date(), // автор подтвердил
            },
          });
        }
      }
      const hasReview = await db.review.findFirst({ where: { authorUserId: clientId, profileId: profile.id } });
      if (!hasReview) {
        await db.review.create({
          data: {
            authorUserId: clientId, profileId: profile.id,
            rating: 5 - (ci % 2), body: CLIENTS[ci].text,
            verified: true, status: 'VISIBLE',
          },
        });
      }
    }

    // 9) Лайки — чтобы ленты и рейтинг ожили
    const shots = await db.photo.findMany({ where: { profileId: profile.id, status: 'APPROVED' }, select: { id: true } });
    for (const [si, shot] of shots.entries()) {
      for (const clientId of clientIds.slice(0, 1 + ((index + si) % CLIENTS.length))) {
        await db.like.upsert({
          where: { userId_photoId: { userId: clientId, photoId: shot.id } },
          create: { userId: clientId, photoId: shot.id, weightMilli: 1000 },
          update: {},
        });
      }
    }

    console.log(`  ✓ ${profile.username}`);
  }

  console.log(`Добавлено кадров: ${photosAdded}, роликов: ${videosAdded}`);
  console.log('Пересчёт рейтингов…');
  const n = await recomputeRatings();
  console.log(`Готово. Пересчитано профилей: ${n}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
