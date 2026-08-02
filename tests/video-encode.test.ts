import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_CODECS, MAX_DURATION_SEC, encodeArgs, keyframeArgs, parseProbe,
  posterArgs, rejectReason, variantsFor,
} from '@/lib/video-encode';

// Решения пайплайна проверяются без ffmpeg: «брать ли ролик» и «в каком
// качестве кодировать» — чистая логика, и она должна быть покрыта, иначе
// ошибку видно только на проде через минуту транскода.
describe('видео: разбор probe', () => {
  const raw = {
    streams: [
      { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, duration: '12.5' },
      { codec_type: 'audio', codec_name: 'aac' },
    ],
    format: { duration: '12.480000' },
  };

  it('читает длительность, размер, кодек и наличие звука', () => {
    expect(parseProbe(raw)).toEqual({
      durationSec: 12, width: 1920, height: 1080, codec: 'h264', hasAudio: true,
    });
  });

  it('берёт длительность из потока, если формат её не отдал', () => {
    // Ролики с телефонов приходят без duration в format — без запасного
    // источника такой файл отбраковывался бы ни за что
    const noFormatDuration = { streams: raw.streams, format: {} };
    expect(parseProbe(noFormatDuration)?.durationSec).toBe(13); // 12.5 округляется
  });

  it('файл без видеодорожки и мусор — не видео', () => {
    expect(parseProbe({ streams: [{ codec_type: 'audio' }], format: {} })).toBeNull();
    expect(parseProbe(null)).toBeNull();
    expect(parseProbe('не json')).toBeNull();
    expect(parseProbe({ streams: [{ codec_type: 'video', codec_name: 'h264' }] })).toBeNull(); // без размеров
  });
});

describe('видео: гард после probe', () => {
  const base = { width: 1920, height: 1080, codec: 'h264', hasAudio: true };

  it('пропускает нормальный ролик', () => {
    expect(rejectReason({ ...base, durationSec: 60 })).toBeNull();
  });

  it('режет длинное, пустое и нечитаемое', () => {
    expect(rejectReason({ ...base, durationSec: MAX_DURATION_SEC + 1 })).toBe('video_too_long');
    expect(rejectReason({ ...base, durationSec: 0 })).toBe('video_too_short');
    expect(rejectReason({ ...base, durationSec: 30, codec: 'prores' })).toBe('video_codec_unsupported');
  });

  it('ровно на границе длительности ролик ещё принимается', () => {
    expect(rejectReason({ ...base, durationSec: MAX_DURATION_SEC })).toBeNull();
  });

  it('перечень кодеков покрывает то, что реально приносят камеры и телефоны', () => {
    for (const codec of ['h264', 'hevc']) expect(ACCEPTED_CODECS).toContain(codec);
  });
});

describe('видео: выбор вариантов', () => {
  it('из 4K делает обе ступени', () => {
    expect(variantsFor(2160).map((v) => v.height)).toEqual([1080, 720]);
  });

  it('из 720p не делает «1080p» — апскейл только утяжелил бы файл', () => {
    expect(variantsFor(720).map((v) => v.height)).toEqual([720]);
  });

  it('низкий исходник кодируется в своей высоте, и она остаётся чётной', () => {
    // H.264 требует кратности двум; нечётная высота уронила бы ffmpeg
    expect(variantsFor(481).map((v) => v.height)).toEqual([480]);
    expect(variantsFor(360).map((v) => v.height)).toEqual([360]);
  });
});

describe('видео: аргументы ffmpeg', () => {
  const variant = { name: 'hd' as const, height: 1080, maxrateK: 4000, bufsizeK: 8000, audioK: 128 };

  it('web-вариант отдаётся прогрессивно и с потолком битрейта', () => {
    const args = encodeArgs('in.mp4', 'out.mp4', variant, true);
    // Без faststart браузер не начнёт играть, пока не скачает файл целиком
    expect(args.join(' ')).toContain('-movflags +faststart');
    expect(args.join(' ')).toContain('-maxrate 4000k');
    expect(args.join(' ')).toContain('scale=-2:1080');
    expect(args.join(' ')).toContain('-c:a aac');
  });

  it('немое видео кодируется без пустой звуковой дорожки', () => {
    const args = encodeArgs('in.mp4', 'out.mp4', variant, false);
    expect(args).toContain('-an');
    expect(args.join(' ')).not.toContain('-c:a aac');
  });

  it('постер берётся не с нулевой секунды — начало часто затемнено', () => {
    const args = posterArgs('in.mp4', 'poster.jpg', 60);
    const at = Number(args[args.indexOf('-ss') + 1]);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(3);
    expect(args).toContain('-frames:v');
  });

  it('короткий ролик не просит кадр за пределами своей длины', () => {
    const at = Number(posterArgs('in.mp4', 'p.jpg', 2)[posterArgs('in.mp4', 'p.jpg', 2).indexOf('-ss') + 1]);
    expect(at).toBeLessThan(2);
  });

  it('кадры для премодерации берутся по всей длине, а не подряд с начала', () => {
    const args = keyframeArgs('in.mp4', 'kf-%d.jpg', 90, 3);
    const vf = args[args.indexOf('-vf') + 1];
    const fps = Number(vf.match(/fps=([\d.]+)/)![1]);
    expect(fps).toBeLessThan(1); // реже кадра в секунду — значит разнесены по ролику
    expect(args[args.indexOf('-frames:v') + 1]).toBe('3');
  });
});
