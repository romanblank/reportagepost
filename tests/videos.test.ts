import { describe, expect, it } from 'vitest';
import 'dotenv/config';
import { validateVideoUpload, contentTypeForKey, VideoValidationError, MAX_VIDEO_BYTES } from '@/lib/videos';

const hasDb = Boolean(process.env.DATABASE_URL);

describe('videos: валидация загрузки (формат + вес)', () => {
  it('принимает mp4/webm/mov, возвращает расширение', () => {
    expect(validateVideoUpload('video/mp4', 1000)).toEqual({ ext: 'mp4' });
    expect(validateVideoUpload('video/webm', 1000)).toEqual({ ext: 'webm' });
    expect(validateVideoUpload('video/quicktime', 1000)).toEqual({ ext: 'mov' });
  });

  it('отклоняет чужой формат и пустой/большой файл', () => {
    expect(() => validateVideoUpload('image/png', 1000)).toThrow(VideoValidationError);
    expect(() => validateVideoUpload('application/x-msdownload', 1000)).toThrow(/unsupported_format/);
    expect(() => validateVideoUpload('video/mp4', 0)).toThrow(/empty/);
    expect(() => validateVideoUpload('video/mp4', MAX_VIDEO_BYTES + 1)).toThrow(/file_too_large/);
  });
});

describe('videos: content-type по ключу (раздатчик /files)', () => {
  it('видео-расширения → video/*', () => {
    expect(contentTypeForKey('videos/abc/source.mp4')).toBe('video/mp4');
    expect(contentTypeForKey('videos/abc/source.webm')).toBe('video/webm');
    expect(contentTypeForKey('videos/abc/source.mov')).toBe('video/quicktime');
  });
  it('изображения → image/*, неизвестное → null', () => {
    expect(contentTypeForKey('photos/x/web.jpg')).toBe('image/jpeg');
    expect(contentTypeForKey('photos/x/web.webp')).toBe('image/webp');
    expect(contentTypeForKey('weird/key/noext')).toBeNull();
    expect(contentTypeForKey('some/file.xyz')).toBeNull();
  });
});

/**
 * Видео-перк партнёрских правок (2026-08-18): Free 0 / Prime 3 / Elite 7.
 * Лимит гейтит ЗАГРУЗКУ, а не показ: ролик, принятый при старых лимитах или
 * до истечения подписки, обязан остаться видимым — «смена уровня не делает
 * принятый ролик негодным» (инвариант video-tiers). Стережёт аудит 2026-09-09.
 */
describe.skipIf(!hasDb)('videos: READY-ролик Free-автора остаётся видимым (БД)', () => {
  it('лимит Free = 0, но уже загруженный ролик страница отдаёт', async () => {
    const { db } = await import('@/lib/db');
    const { videoLimit } = await import('@/lib/pricing');
    expect(videoLimit('FREE')).toBe(0); // сам перк: новых роликов Free не грузит

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const author = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Вид', lastName: 'Фри', email: `vidfree-${stamp}@test.local` },
    });
    // Подписки НЕТ — автор Free
    const profile = await db.photographerProfile.create({
      data: { userId: author.id, username: `vidfree-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    const video = await db.profileVideo.create({
      data: {
        profileId: profile.id, storageKey: `videos/vidfree-${stamp}/source.mp4`,
        mimeType: 'video/mp4', sizeBytes: 1_000_000, status: 'APPROVED', processing: 'READY',
        hdKey: `videos/vidfree-${stamp}/hd.mp4`, sdKey: `videos/vidfree-${stamp}/sd.mp4`,
      },
    });

    try {
      // Та же выборка, что у страницы автора: только APPROVED + READY, БЕЗ
      // условия на уровень подписки — показ не гейтится тарифом
      const rows = await db.profileVideo.findMany({
        where: { profileId: profile.id, status: 'APPROVED', processing: 'READY' },
        orderBy: { sortOrder: 'asc' },
      });
      expect(rows.map((v) => v.id)).toContain(video.id);

      // Страж от регрессии в самой странице: фильтр видео не должен обрасти
      // условием тарифа (proRank/tier) — иначе тест выше станет тавтологией
      const { readFileSync } = await import('node:fs');
      const path = await import('node:path');
      const page = readFileSync(path.join(process.cwd(), 'src/app/ru/photographer/[username]/page.tsx'), 'utf8');
      const videosWhere = page.match(/videos:\s*\{[^}]*where:\s*\{[^}]*\}/)?.[0] ?? '';
      expect(videosWhere).toContain("processing: 'READY'");
      expect(videosWhere).not.toMatch(/proRank|tier|subscription/i);
    } finally {
      await db.profileVideo.deleteMany({ where: { profileId: profile.id } });
      await db.photographerProfile.delete({ where: { id: profile.id } });
      await db.user.delete({ where: { id: author.id } });
    }
  });
});
