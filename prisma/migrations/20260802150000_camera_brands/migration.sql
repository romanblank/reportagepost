-- Фильтр каталога по технике (прототип v9): нормализованные бренды камер.
--
-- Поле cameras хранит свободный текст («Sony A7 IV», «Canon R5»), по нему
-- нельзя ни отфильтровать по массиву, ни построить индекс. Отдельная колонка
-- с каноническими брендами решает и то и другое; пересчитывается при
-- сохранении анкеты.
--
-- Бэкфилл: разбираем уже введённую технику по известным брендам — иначе фильтр
-- у существующих авторов был бы пустым, и они молча выпали бы из выдачи.
--
-- SAFE-TO-ROLLBACK: добавление колонки с дефолтом; исходные cameras не трогаем.

ALTER TABLE "PhotographerProfile" ADD COLUMN "cameraBrands" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "PhotographerProfile" p
SET "cameraBrands" = sub.brands
FROM (
  SELECT id,
         ARRAY(
           SELECT DISTINCT b
           FROM unnest("cameras") AS c
           CROSS JOIN LATERAL (
             SELECT CASE
               WHEN c ILIKE 'sony%'    THEN 'Sony'
               WHEN c ILIKE 'canon%'   THEN 'Canon'
               WHEN c ILIKE 'nikon%'   THEN 'Nikon'
               WHEN c ILIKE 'fuji%'    THEN 'Fujifilm'
               WHEN c ILIKE 'panasonic%' OR c ILIKE 'lumix%' THEN 'Panasonic'
               WHEN c ILIKE 'leica%'   THEN 'Leica'
               ELSE NULL
             END AS b
           ) t
           WHERE b IS NOT NULL
         ) AS brands
  FROM "PhotographerProfile"
) sub
WHERE p.id = sub.id;
