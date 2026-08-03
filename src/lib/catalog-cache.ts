import { unstable_cache } from 'next/cache';
import { brandCountsForCity, categoryCountsForCity, recommendedForCity } from '@/lib/catalog';

/**
 * Кэш неперсонализированной части страницы города.
 *
 * Каталог был единственной большой страницей без кэша вообще: до тринадцати
 * запросов к базе на КАЖДЫЙ заход анонимного посетителя, при том что для
 * главной такой кэш давно сделан. Это не гипотетический рост нагрузки, а
 * фиксированная стоимость каждого открытия — и она умножается на всех, кто
 * придёт одновременно после рассылки или анонса.
 *
 * Кэшируем ровно то, что не зависит от фильтров в адресе: счётчики жанров и
 * техники, полку рекомендуемых. Сам список авторов остаётся живым — он меняется
 * от параметров и должен отражать выбор посетителя точно.
 *
 * Две минуты — компромисс: свежесозданная анкета появится в счётчиках с
 * задержкой, но пик посещаемости не будет бить по базе.
 */
const TTL_SECONDS = 120;

export const cachedCityFacets = (citySlug: string) =>
  unstable_cache(
    async () => {
      const [categories, brands, recommended] = await Promise.all([
        categoryCountsForCity(citySlug),
        brandCountsForCity(citySlug),
        recommendedForCity(citySlug),
      ]);
      return { categories, brands, recommended };
    },
    ['city-facets', citySlug],
    // Тег с городом: одобрение анкеты сбрасывает кэш только своего города,
    // а не всех сразу
    { revalidate: TTL_SECONDS, tags: ['catalog', `catalog:${citySlug}`] },
  )();
