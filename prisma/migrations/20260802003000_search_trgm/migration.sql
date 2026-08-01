-- Поиск с устойчивостью к опечаткам (аудит 2026-08-01, P2).
--
-- Поиск был подстрочным ILIKE: «Ивонов» вместо «Иванов» не находил ничего, а
-- поиск по имени — главный сценарий клиента, которому фотографа
-- порекомендовали («ищу Петра, снимал у друзей»). Промах здесь = потерянный лид.
--
-- pg_trgm даёт похожесть по триграммам; GIN-индексы делают её пригодной для
-- запроса, а не только для перебора.
--
-- SAFE-TO-ROLLBACK: расширение и индексы; данные не затрагиваются.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "PhotographerProfile_username_trgm_idx"
  ON "PhotographerProfile" USING gin ("username" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "User_firstName_trgm_idx"
  ON "User" USING gin ("firstName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "User_lastName_trgm_idx"
  ON "User" USING gin ("lastName" gin_trgm_ops);
