import { describe, expect, it } from 'vitest';
import { guardModelVerdict, programmaticVerdict } from '@/lib/text-moderation';

/**
 * Автомодерация решает судьбу чужих текстов без человека, поэтому проверяем не
 * «функция вернула объект», а те решения, за которые придётся отвечать перед
 * автором: что именно отклоняется, что пропускается и почему.
 */
describe('программные правила модерации', () => {
  const post = (text: string, recent: string[] = []) =>
    programmaticVerdict({ text, kind: 'post', recent });

  it('контакты в публичном тексте отклоняются с цитатой', () => {
    const v = post('Пишите мне на +7 999 123-45-67, обсудим съёмку подробно.');
    expect(v?.action).toBe('reject');
    expect(v && 'reason' in v && v.reason).toBe('contacts');
    // Без цитаты автор правит наугад
    expect(v && 'quote' in v && v.quote).toBeTruthy();
  });

  it('почта и мессенджер — тоже контакты', () => {
    expect(post('мой адрес olga@example.com, пишите')?.action).toBe('reject');
    expect(post('телеграм @olga_photo, отвечу быстро')?.action).toBe('reject');
  });

  it('ссылка наружу отклоняется, а ссылка на площадку — нет', () => {
    const out = post('Смотрите примеры на моём сайте olga-photo.ru, там всё есть.');
    expect(out?.action).toBe('reject');
    expect(out && 'reason' in out && out.reason).toBe('external_link');

    // Внутренняя ссылка — это польза, а не увод с площадки
    expect(post('Вот эта тема: https://reportagepost.com/ru/forum/craft полезная.')).toBeNull();
  });

  it('капслок ловится, обычный текст с аббревиатурами — нет', () => {
    expect(post('СРОЧНО НУЖЕН ОТВЕТ ПОЧЕМУ НИКТО НЕ ОТВЕЧАЕТ Я ЖДУ УЖЕ ДОЛГО')?.action).toBe('reject');
    expect(post('Снимал на RAW, потом JPEG для клиента — разница в динамическом диапазоне заметна.')).toBeNull();
  });

  it('повтор того же текста отклоняется', () => {
    const text = 'Подскажите, какой объектив брать на репортаж в тёмном зале?';
    expect(post(text, [text])?.action).toBe('reject');
    expect(post(text, ['совсем другой текст про свет'])).toBeNull();
  });

  it('слишком короткое сообщение — отказ, но не нарушение по существу', () => {
    const v = post('ок');
    expect(v?.action).toBe('reject');
    expect(v && 'reason' in v && v.reason).toBe('too_short');
  });

  it('нормальный профессиональный текст проходит', () => {
    expect(post('На венчаниях снимаю на два тела: 35 мм и 85 мм, чтобы не менять оптику в движении.')).toBeNull();
  });
});

describe('guard над вердиктом модели', () => {
  const text = 'Ты бездарь и снимать не умеешь, зря люди тебе платят.';

  it('высокая уверенность с дословной цитатой — отказ', () => {
    const v = guardModelVerdict(
      { verdict: 'bad', category: 'insult', confidence: 0.93, quote: 'Ты бездарь' },
      text,
    );
    expect(v?.action).toBe('reject');
  });

  it('выдуманная цитата не даёт отказать', () => {
    // Цитата, которой нет в тексте, — признак того, что модель пересказала
    // свои ожидания, а не прочитала текст. Отказ по такому вердикту
    // невозможно объяснить автору
    const v = guardModelVerdict(
      { verdict: 'bad', category: 'insult', confidence: 0.99, quote: 'ты ужасен и туп' },
      text,
    );
    expect(v?.action).toBe('review');
  });

  it('средняя уверенность уходит человеку, а не в отказ', () => {
    const v = guardModelVerdict(
      { verdict: 'bad', category: 'hidden_ad', confidence: 0.6, quote: 'зря люди тебе платят' },
      text,
    );
    expect(v?.action).toBe('review');
  });

  it('низкая уверенность публикует: ошибочный отказ дороже пропущенной резкости', () => {
    const v = guardModelVerdict(
      { verdict: 'bad', category: 'insult', confidence: 0.2, quote: 'Ты бездарь' },
      text,
    );
    expect(v?.action).toBe('publish');
  });

  it('мусор и неизвестная категория не применяются', () => {
    expect(guardModelVerdict({ verdict: 'что-то' }, text)).toBeNull();
    expect(guardModelVerdict({ verdict: 'bad', category: 'мне_не_нравится', confidence: 1 }, text)).toBeNull();
    expect(guardModelVerdict('не объект', text)).toBeNull();
    expect(guardModelVerdict(null, text)).toBeNull();
  });

  it('вердикт «ok» публикует', () => {
    expect(guardModelVerdict({ verdict: 'ok', category: null, confidence: 0.9 }, text)?.action).toBe('publish');
  });
});
