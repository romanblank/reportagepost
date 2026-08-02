import { describe, expect, it } from 'vitest';
import { extractImageUrls, assertPublicUrl, MAX_CANDIDATES } from '@/lib/import-portfolio';

// Импорт по ссылке — единственное место, где НАШ сервер ходит по адресу,
// который выбрал пользователь. Это классический SSRF: у сервера есть доступ к
// внутренней сети и к сервису метаданных облака, откуда забирают токены
// сервисного аккаунта. Поэтому гард адреса проверяется отдельно и подробно —
// его молчаливая поломка означала бы утечку доступа ко всей инфраструктуре.
describe('импорт портфолио: гард адреса (SSRF)', () => {
  it('пропускает обычный публичный адрес', async () => {
    const url = await assertPublicUrl('https://example.com/portfolio');
    expect(url.hostname).toBe('example.com');
  });

  it('не ходит по внутренним адресам', async () => {
    for (const bad of [
      'http://localhost/admin',
      'http://127.0.0.1:3000/',
      'http://10.0.0.5/',
      'http://192.168.0.1/',
      'http://172.16.0.9/',
      'http://[::1]/',
    ]) {
      await expect(assertPublicUrl(bad), bad).rejects.toMatchObject({ code: 'import_blocked_host' });
    }
  });

  it('не ходит к метаданным облака', async () => {
    // 169.254.169.254 — главная цель SSRF: оттуда достают токен сервисного
    // аккаунта и получают доступ к бакету и базе
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data/')).rejects.toMatchObject({
      code: 'import_blocked_host',
    });
  });

  it('не открывает нестандартные порты — там живут внутренние сервисы', async () => {
    await expect(assertPublicUrl('http://example.com:5432/')).rejects.toMatchObject({ code: 'import_blocked_host' });
    await expect(assertPublicUrl('http://example.com:9200/')).rejects.toMatchObject({ code: 'import_blocked_host' });
  });

  it('отвергает не-HTTP схемы', async () => {
    for (const bad of ['file:///etc/passwd', 'gopher://example.com/', 'ftp://example.com/x.jpg', 'не ссылка']) {
      await expect(assertPublicUrl(bad), bad).rejects.toMatchObject({ code: 'import_bad_url' });
    }
  });

  it('несуществующее имя не проходит как «публичное»', async () => {
    await expect(
      assertPublicUrl('https://такого-домена-точно-нет-12345.invalid/'),
    ).rejects.toMatchObject({ code: 'import_unreachable' });
  });
});

describe('импорт портфолио: разбор страницы', () => {
  const page = 'https://author.example/works';

  it('собирает кадры из og:image, srcset и обычных img', () => {
    const html = `
      <meta property="og:image" content="/img/hero.jpg">
      <img src="/img/one.jpg">
      <img srcset="/img/small.jpg 480w, /img/big.jpg 2400w" src="/img/small.jpg">
      <img data-src="/img/lazy.jpg" src="data:image/gif;base64,R0lGOD">
    `;
    const found = extractImageUrls(html, page);
    expect(found).toContain('https://author.example/img/hero.jpg');
    expect(found).toContain('https://author.example/img/one.jpg');
    // Из srcset берём самый крупный — портфолио заслуживает оригинала
    expect(found).toContain('https://author.example/img/big.jpg');
    expect(found).not.toContain('https://author.example/img/small.jpg');
    // Ленивая загрузка прячет настоящий адрес в data-src, в src лежит заглушка
    expect(found).toContain('https://author.example/img/lazy.jpg');
    expect(found.some((u) => u.startsWith('data:'))).toBe(false);
  });

  it('отсеивает логотипы, иконки и заглушки', () => {
    const html = `
      <img src="/logo.png"><img src="/icons/vk.svg"><img src="/sprite-nav.png">
      <img src="/placeholder.jpg"><img src="/favicon.ico"><img src="/works/real-shot.jpg">
    `;
    // Иначе автор получил бы сетку из значков соцсетей вместо своих работ
    expect(extractImageUrls(html, page)).toEqual(['https://author.example/works/real-shot.jpg']);
  });

  it('не выпускает за пределы http(s) и не дублирует кадры', () => {
    const html = `
      <img src="javascript:alert(1)"><img src="/a.jpg"><img src="/a.jpg">
      <img src="https://cdn.other.example/b.jpg">
    `;
    const found = extractImageUrls(html, page);
    expect(found).toEqual(['https://author.example/a.jpg', 'https://cdn.other.example/b.jpg']);
  });

  it('ограничивает число кандидатов — на странице бывают сотни картинок', () => {
    const html = Array.from({ length: 200 }, (_, i) => `<img src="/works/${i}.jpg">`).join('');
    expect(extractImageUrls(html, page)).toHaveLength(MAX_CANDIDATES);
  });

  it('пустая страница не выдаёт мусора', () => {
    expect(extractImageUrls('<html><body><p>ничего</p></body></html>', page)).toEqual([]);
  });
});
