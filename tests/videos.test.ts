import { describe, expect, it } from 'vitest';
import { validateVideoUpload, contentTypeForKey, VideoValidationError, MAX_VIDEO_BYTES } from '@/lib/videos';

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
