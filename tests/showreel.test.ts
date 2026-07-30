import { describe, expect, it } from 'vitest';
import { parseShowreel, parseShowreels } from '@/lib/showreel';

describe('showreel: безопасный whitelist-парсер embed', () => {
  it('YouTube — все формы ссылки → embed', () => {
    for (const u of [
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/embed/dQw4w9WgXcQ',
    ]) {
      expect(parseShowreel(u)).toEqual({ provider: 'youtube', embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ' });
    }
  });

  it('Vimeo / RuTube / VK → embed', () => {
    expect(parseShowreel('https://vimeo.com/76979871')).toEqual({ provider: 'vimeo', embedUrl: 'https://player.vimeo.com/video/76979871' });
    expect(parseShowreel('https://rutube.ru/video/abc123def/')).toEqual({ provider: 'rutube', embedUrl: 'https://rutube.ru/play/embed/abc123def' });
    expect(parseShowreel('https://vk.com/video-12345_67890')).toEqual({ provider: 'vk', embedUrl: 'https://vk.com/video_ext.php?oid=-12345&id=67890&hd=2' });
  });

  it('ОТКЛОНЯЕТ произвольные/опасные ссылки → null (защита от инъекции iframe)', () => {
    for (const u of [
      'https://evil.com/xss',
      'javascript:alert(1)',
      'data:text/html,<script>',
      'https://youtube.evil.com/embed/x',
      'not a url',
      '',
    ]) {
      expect(parseShowreel(u)).toBeNull();
    }
  });

  it('parseShowreels отсеивает невалидные, оставляет валидные', () => {
    const out = parseShowreels(['https://youtu.be/dQw4w9WgXcQ', 'https://evil.com/x', 'https://vimeo.com/1']);
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.provider)).toEqual(['youtube', 'vimeo']);
  });
});
