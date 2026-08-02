import { describe, expect, it } from 'vitest';
import { findTextIssues, mediaRefs, visibleText } from '@/lib/page-audit';

// Страж самого стража: аудитор выдач, который ничего не находит, неотличим от
// чистого сайта — и такой «зелёный» опаснее отсутствия проверки. Здесь
// проверяется, что детекторы реагируют на дефекты и молчат на нормальном тексте.
describe('аудит выдач: детекторы', () => {
  it('RSC-payload и стили не попадают в видимый текст', () => {
    const html = `
      <html><head><style>.a{color:red}</style></head>
      <body><h1>Роман Затвор</h1>
      <script>self.__next_f.push([1,"{\\"status\\":\\"APPROVED\\",\\"x\\":null}"])</script>
      </body></html>`;
    const text = visibleText(html);
    expect(text).toContain('Роман Затвор');
    // Иначе каждая страница «находила» бы служебные значения из полезной нагрузки
    expect(text).not.toContain('APPROVED');
    expect(text).not.toContain('color:red');
    expect(findTextIssues(text)).toEqual([]);
  });

  it('видит непереведённый статус на экране', () => {
    const issues = findTextIssues('Анкета: APPROVED — можно публиковать');
    expect(issues.join(' ')).toContain('APPROVED');
  });

  it('видит следы недоделанной работы', () => {
    expect(findTextIssues('Съёмок: undefined').join(' ')).toContain('undefined');
    expect(findTextIssues('Цена: NaN ₽').join(' ')).toContain('NaN');
    expect(findTextIssues('Автор: [object Object]').join(' ')).toContain('[object Object]');
    expect(findTextIssues('Привет, {{name}}!').join(' ')).toContain('{{');
  });

  it('видит невыведенный ключ словаря', () => {
    expect(findTextIssues('profile.aboutTitle').join(' ')).toContain('profile.aboutTitle');
  });

  it('не придирается к обычному русскому тексту, доменам и файлам', () => {
    const text =
      'Репортажный фотограф в Москве. Пишите на mail@reportagepost.com, ' +
      'смотрите reportagepost.com и файл portfolio.jpg. Съёмка события от 28 000 ₽.';
    expect(findTextIssues(text)).toEqual([]);
  });

  it('собирает ссылки на медиа, игнорируя внешние и служебные', () => {
    const html =
      '<img src="/files/photos/a/web.jpg"><img src="https://cdn.example/x.jpg">' +
      '<video poster="/files/videos/b/poster.jpg"></video><img src="/icon.svg">';
    expect(mediaRefs(html)).toEqual(['/files/photos/a/web.jpg', '/files/videos/b/poster.jpg']);
  });
});
