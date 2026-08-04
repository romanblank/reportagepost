import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const run = promisify(execFile);
const hasDb = Boolean(process.env.DATABASE_URL);
const hasFfmpeg = await run('ffmpeg', ['-version']).then(() => true).catch(() => false);

// Пайплайн проверяется НА НАСТОЯЩЕМ ролике: чистые функции уже покрыты, но
// «аргументы правильные» и «файл получился играбельным» — разные утверждения,
// и мимо второго однажды уже проехали (шоурилы демо-витрины выходили длиной
// от 2 до 7 секунд вместо 10, хотя команда выглядела корректной).
//
// env-зависимость (правило (c)): нужны локальный PostgreSQL и ffmpeg.
describe.skipIf(!hasDb || !hasFfmpeg)('видео: обработка загруженного ролика (БД + ffmpeg)', () => {
  it('транскодит, делает постер, чистит исходник и снимает мерки', async () => {
    const { db } = await import('@/lib/db');
    const { storage } = await import('@/lib/storage');
    const { processVideo } = await import('@/lib/video-pipeline');

    const dir = await mkdtemp(path.join(tmpdir(), 'rp-vtest-'));
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const owner = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'В', lastName: 'И', email: `vid-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: owner.id, username: `vid-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });

    try {
      // Синтетический ролик: 3 секунды 1280×720 с движением и тишиной
      const src = path.join(dir, 'src.mp4');
      await run('ffmpeg', [
        '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=25:duration=3',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src,
      ]);
      const bytes = await readFile(src);
      const storageKey = `videos/test-${stamp}/source.mp4`;
      await storage.putStream(storageKey, Readable.from(bytes), 'video/mp4', bytes.byteLength);

      const video = await db.profileVideo.create({
        data: {
          profileId: profile.id, storageKey, mimeType: 'video/mp4', sizeBytes: bytes.byteLength,
          status: 'APPROVED', processing: 'UPLOADED',
        },
      });

      const result = await processVideo(video.id);
      expect(result.ok, `обработка провалилась: ${result.reason}`).toBe(true);

      const done = await db.profileVideo.findUniqueOrThrow({ where: { id: video.id } });
      expect(done.processing).toBe('READY');
      expect(done.durationSec).toBe(3);
      expect(done.height).toBe(720);
      expect(done.codec).toBe('h264');
      // Из 720p апскейл в 1080p не делаем — был бы тот же кадр, но вдвое тяжелее
      expect(done.hdKey).toBeNull();
      expect(done.sdKey).not.toBeNull();
      expect(done.posterKey).not.toBeNull();
      expect(done.processedBytes ?? 0).toBeGreaterThan(0);

      // Вариант и постер реально лежат в хранилище и читаются
      const variant = await storage.getStream(done.sdKey!);
      expect(variant).not.toBeNull();
      const poster = await storage.getStream(done.posterKey!);
      expect(poster).not.toBeNull();

      // Исходник удалён: раздаём только варианты, сырое хранить незачем
      expect(await storage.getStream(storageKey)).toBeNull();

      // Повторный запуск на готовом ролике ничего не переделывает
      const again = await processVideo(video.id);
      expect(again.ok).toBe(false);
      expect(again.reason).toBe('already_claimed');

      // Очередь берёт только необработанные
      const { processVideoQueue } = await import('@/lib/video-pipeline');
      const queued = await processVideoQueue(5);
      expect(queued.some((r) => r.id === video.id)).toBe(false);

      await db.profileVideo.delete({ where: { id: video.id } });
      for (const key of [done.sdKey, done.posterKey]) if (key) await storage.delete(key).catch(() => {});
    } finally {
      await db.photographerProfile.delete({ where: { id: profile.id } }).catch(() => {});
      await db.user.delete({ where: { id: owner.id } }).catch(() => {});
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);

  it('слишком длинный ролик отбраковывается с причиной, понятной автору', async () => {
    const { db } = await import('@/lib/db');
    const { storage } = await import('@/lib/storage');
    const { processVideo } = await import('@/lib/video-pipeline');

    const dir = await mkdtemp(path.join(tmpdir(), 'rp-vlong-'));
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const owner = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Д', lastName: 'Л', email: `vlong-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: owner.id, username: `vlong-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });

    try {
      const src = path.join(dir, 'long.mp4');
      // 95 секунд статичной картинки — весит копейки, но длиннее потолка
      await run('ffmpeg', [
        '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:size=320x240:rate=5:duration=95',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src,
      ]);
      const bytes = await readFile(src);
      const storageKey = `videos/test-long-${stamp}/source.mp4`;
      await storage.putStream(storageKey, Readable.from(bytes), 'video/mp4', bytes.byteLength);
      const video = await db.profileVideo.create({
        data: {
          profileId: profile.id, storageKey, mimeType: 'video/mp4', sizeBytes: bytes.byteLength,
          status: 'APPROVED', processing: 'UPLOADED',
        },
      });

      const result = await processVideo(video.id);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('video_too_long');

      const done = await db.profileVideo.findUniqueOrThrow({ where: { id: video.id } });
      expect(done.processing).toBe('FAILED');
      expect(done.failureReason).toBe('video_too_long');
      // Отбракованный ролик не должен притворяться готовым к показу
      expect(done.sdKey).toBeNull();
      expect(done.hdKey).toBeNull();

      await db.profileVideo.delete({ where: { id: video.id } });
      await storage.delete(storageKey).catch(() => {});
    } finally {
      await db.photographerProfile.delete({ where: { id: profile.id } }).catch(() => {});
      await db.user.delete({ where: { id: owner.id } }).catch(() => {});
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);
});

// Находки собственного ревью (2026-08-02): два способа «застрять навсегда».
describe.skipIf(!hasDb)('видео: устойчивость очереди (БД)', () => {
  it('ролик, брошенный в обработке, возвращается в очередь', async () => {
    const { db } = await import('@/lib/db');
    const { requeueStuck } = await import('@/lib/video-pipeline');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const owner = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'С', lastName: 'Т', email: `stuck-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: owner.id, username: `stuck-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });

    try {
      // Контейнер перезапустили посреди транскода: пометка осталась, обрабатывать некому
      const oldStuck = await db.profileVideo.create({
        data: {
          profileId: profile.id, storageKey: `videos/stuck-old-${stamp}/source.mp4`, mimeType: 'video/mp4',
          sizeBytes: 1000, processing: 'PROCESSING',
          // Застревание считается от МОМЕНТА ЗАХВАТА: ролик, давно лежащий в
          // очереди, но взятый в работу только что, отбирать нельзя
          claimedAt: new Date(Date.now() - 2 * 60 * 60_000),
        },
      });
      // А этот взят воркером только что — отбирать нельзя
      const fresh = await db.profileVideo.create({
        data: {
          profileId: profile.id, storageKey: `videos/stuck-new-${stamp}/source.mp4`, mimeType: 'video/mp4',
          sizeBytes: 1000, processing: 'PROCESSING', claimedAt: new Date(),
        },
      });

      const requeued = await requeueStuck();
      expect(requeued).toBeGreaterThanOrEqual(1);

      expect((await db.profileVideo.findUniqueOrThrow({ where: { id: oldStuck.id } })).processing).toBe('UPLOADED');
      expect((await db.profileVideo.findUniqueOrThrow({ where: { id: fresh.id } })).processing).toBe('PROCESSING');

      await db.profileVideo.deleteMany({ where: { profileId: profile.id } });
    } finally {
      await db.photographerProfile.delete({ where: { id: profile.id } }).catch(() => {});
      await db.user.delete({ where: { id: owner.id } }).catch(() => {});
    }
  });

  it('все объекты ролика перечисляются вместе — забыть вариант нельзя', async () => {
    const { videoStorageKeys } = await import('@/lib/videos');
    // После удаления аккаунта web-варианты и постер оставались в бакете и
    // раздавались по прямой ссылке — материалы человека, потребовавшего удаления
    expect(
      videoStorageKeys({ storageKey: 's/source.mp4', hdKey: 's/hd.mp4', sdKey: 's/sd.mp4', posterKey: 's/poster.jpg' }),
    ).toEqual(['s/source.mp4', 's/hd.mp4', 's/sd.mp4', 's/poster.jpg']);
    // Необработанный ролик — только исходник, без пустых ключей
    expect(videoStorageKeys({ storageKey: 's/source.mp4', hdKey: null, sdKey: null, posterKey: null }))
      .toEqual(['s/source.mp4']);
  });
});
