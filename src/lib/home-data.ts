import { unstable_cache } from 'next/cache';
import { catalogForCity } from '@/lib/catalog';
import { bestOfWeek, freshPhotos } from '@/lib/feeds';
import { categoryPreviews, freshStories } from '@/lib/discovery';
import { communityStats, recentPhotographers } from '@/lib/widgets';
import { db } from '@/lib/db';

// Кеш витринных данных главной (аудит 2026-07-31, P1: кеширования не было
// вообще — все страницы force-dynamic, и КАЖДЫЙ заход на главную заново
// агрегировал все лайки за неделю, тянул ленты, считал статистику сообщества.
// На единственной VM это лишняя нагрузка на ровном месте и медленный первый
// экран, а первое впечатление у приглашённых людей единственное).
//
// Кешируем ТОЛЬКО неперсонализированное: ленты, жанры, статистику, новых
// авторов — они одинаковы для всех посетителей. Ничего, зависящего от сессии,
// сюда не попадает, поэтому утечки чужих данных между пользователями быть не может.
//
// TTL 120с: витрина обновляется достаточно живо (новая работа появится в
// пределах двух минут), но пик посещаемости не бьёт по базе. Тег 'home'
// оставлен на будущее — по нему можно сбрасывать кеш точечно, например
// после одобрения фото модератором.

const TTL_SECONDS = 120;

export const cachedHomeData = unstable_cache(
  async () => {
    const [week, fresh, stories, cats, stats, newAuthors, photographers, photos, cityAuthors] = await Promise.all([
      bestOfWeek(12),
      freshPhotos(16),
      freshStories(6),
      categoryPreviews(),
      communityStats(),
      recentPhotographers(4),
      db.photographerProfile.count({ where: { status: 'APPROVED' } }),
      db.photo.count({ where: { status: 'APPROVED' } }),
      // Авторы города на главной (прототип v9): продукт про людей, а главная
      // показывала только кадры. Берём первую страницу каталога Москвы —
      // тот же merit-порядок, что и в каталоге, без отдельной логики.
      catalogForCity({ citySlug: 'moscow' }).then((p) => p.cards.slice(0, 4)),
    ]);
    return { week, fresh, stories, cats, stats, newAuthors, photographers, photos, cityAuthors };
  },
  ['home-showcase'],
  { revalidate: TTL_SECONDS, tags: ['home'] },
);
