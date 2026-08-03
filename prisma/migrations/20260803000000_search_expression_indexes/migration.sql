-- Индексы поиска по ВЫРАЖЕНИЮ, а не по сырой колонке.
--
-- Прежние GIN-индексы стояли на "firstName"/"lastName" как есть, а запрос
-- сравнивает replace(lower(col),'ё','е') — планировщик такой индекс не берёт,
-- и каждый поиск шёл полным сканом (подтверждено EXPLAIN: Seq Scan).
-- Prisma не умеет объявлять expression-индексы, поэтому только сырым SQL.
CREATE INDEX IF NOT EXISTS "User_firstName_norm_trgm_idx"
  ON "User" USING GIN (replace(lower("firstName"), 'ё', 'е') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "User_lastName_norm_trgm_idx"
  ON "User" USING GIN (replace(lower("lastName"), 'ё', 'е') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "PhotographerProfile_username_norm_trgm_idx"
  ON "PhotographerProfile" USING GIN (lower(username) gin_trgm_ops);
