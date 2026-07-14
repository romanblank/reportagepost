import { describe, expect, it } from 'vitest';
import 'dotenv/config';
import { validateCommentBody } from '@/lib/comments';

describe('comments guard: чистая валидация тела', () => {
  it('пустой и слишком длинный отклоняются', () => {
    expect(() => validateCommentBody('   ')).toThrow('comment_empty');
    expect(() => validateCommentBody('a'.repeat(1001))).toThrow('comment_too_long');
  });
  it('ссылки запрещены (http, www, домен, t.me, @handle, .рф)', () => {
    for (const bad of ['смотри http://x.com', 'www.site.ru', 'мой сайт example.com', 'пиши t.me/ivan', 'я @ivan_petrov', 'сайт студия.рф']) {
      expect(() => validateCommentBody(bad), bad).toThrow('comment_no_links');
    }
  });
  it('телефоны/контакты запрещены', () => {
    for (const bad of ['звони +7 900 123-45-67', 'тел 89001234567', 'номер 8 (900) 123 45 67']) {
      expect(() => validateCommentBody(bad), bad).toThrow('comment_no_contacts');
    }
  });
  it('нормальный текст проходит и триммится', () => {
    expect(validateCommentBody('  Отличный репортаж, живые эмоции!  ')).toBe('Отличный репортаж, живые эмоции!');
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('comments: гейт APPROVED, права удаления, каскад (БД)', () => {
  it('коммент только к APPROVED; автор/админ удаляют, чужой — нет; каскад при удалении серии', async () => {
    const { db } = await import('@/lib/db');
    const { addComment, deleteComment } = await import('@/lib/comments');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'О', lastName: 'В', email: `cm-o-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: owner.id, username: `cm-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    const approved = await db.story.create({ data: { profileId: profile.id, categoryId: cat.id, title: 'S', status: 'APPROVED' } });
    const pending = await db.story.create({ data: { profileId: profile.id, categoryId: cat.id, title: 'P', status: 'PENDING' } });
    const commenter = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'К', lastName: 'М', email: `cm-c-${stamp}@test.local` } });
    const stranger = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Ч', lastName: 'Ж', email: `cm-s-${stamp}@test.local` } });

    // на PENDING нельзя
    await expect(addComment(commenter.id, { storyId: pending.id }, 'привет')).rejects.toThrow('target_not_found');

    // на APPROVED можно
    const c = await addComment(commenter.id, { storyId: approved.id }, 'хороший репортаж');
    expect(await db.comment.count({ where: { storyId: approved.id } })).toBe(1);

    // чужой не удалит
    await expect(deleteComment(stranger.id, c.id, false)).rejects.toThrow('forbidden');
    // автор удалит
    await deleteComment(commenter.id, c.id, false);
    expect(await db.comment.count({ where: { storyId: approved.id } })).toBe(0);

    // админ удаляет чужой
    const c2 = await addComment(commenter.id, { storyId: approved.id }, 'ещё коммент');
    await deleteComment(stranger.id, c2.id, true); // isAdmin
    expect(await db.comment.count({ where: { storyId: approved.id } })).toBe(0);

    // каскад: удаление серии удаляет её комментарии
    await addComment(commenter.id, { storyId: approved.id }, 'перед удалением');
    await db.story.delete({ where: { id: approved.id } });
    expect(await db.comment.count({ where: { storyId: approved.id } })).toBe(0);

    await db.activityEvent.deleteMany({ where: { actorUserId: { in: [commenter.id, stranger.id] } } });
    await db.comment.deleteMany({ where: { authorUserId: commenter.id } });
    await db.story.deleteMany({ where: { profileId: profile.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, commenter.id, stranger.id] } } });
  });
});
