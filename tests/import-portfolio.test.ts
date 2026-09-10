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

// Находка собственного ревью: гард проверял только адрес, введённый
// пользователем. Чужой сервер уводит fetch куда угодно одним заголовком
// Location — и проверка оставалась формальностью.
describe('импорт портфолио: редирект не выводит из-под гарда', () => {
  it('переход на внутренний адрес отсекается так же, как прямой ввод', async () => {
    const { createServer } = await import('node:http');
    const { fetchPage } = await import('@/lib/import-portfolio');

    const server = createServer((_req, res) => {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      await expect(fetchPage(new URL(`http://127.0.0.1:${port}/`))).rejects.toMatchObject({
        code: 'import_blocked_host',
      });
    } finally {
      server.close();
    }
  });

  // Потолок переходов (MAX_REDIRECTS в import-portfolio.ts) локальным тестом не
  // проверить: любое кольцо через localhost обрывается раньше — на гарде
  // приватного адреса. Проверять это моком fetch значило бы тестировать мок.
});

// Live-баг 2026-09-10 (brendoskop.ru): SPA без единого <img> отдавала «5
// кадров» — regex og:image матчил и og:image:width/height/type/alt, а их
// значения («1200», «image/jpeg», alt-текст) абсолютизировались в псевдо-URL
describe('extractImageUrls: суффиксные og:image-свойства не считаются кадрами', () => {
  it('берёт og:image и og:image:secure_url, отбрасывает width/height/type/alt', async () => {
    const { extractImageUrls } = await import('@/lib/import-portfolio');
    const html = `
      <meta property="og:image" content="https://site.ru/og.jpg" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:type" content="image/jpeg" />
      <meta property="og:image:alt" content="Название сайта — описание" />
      <meta property="og:image:secure_url" content="https://site.ru/og-secure.jpg" />
    `;
    const urls = extractImageUrls(html, 'https://site.ru/');
    expect(urls).toContain('https://site.ru/og.jpg');
    expect(urls).toContain('https://site.ru/og-secure.jpg');
    expect(urls).toHaveLength(2);
  });
});

