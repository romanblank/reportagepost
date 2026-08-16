-- Гонка двойной отметки съёмки БЕЗ даты (аудит 2026-08-16, P1).
-- Составной уникальный индекс (clientUserId, profileId, eventDate) записи с
-- NULL-датой пропускает: в SQL NULL ≠ NULL. Явная проверка в коде
-- (findFirst → create) неатомарна — двойной клик создавал два подтверждения,
-- а «снимали вместе N раз» и verified-отзывы считаются именно от их числа.
-- Частичный индекс закрывает дыру на уровне БД: код ловит P2002 и отвечает
-- тем же 409, что и явная проверка.
CREATE UNIQUE INDEX IF NOT EXISTS "ShootConfirmation_null_date_unique"
  ON "ShootConfirmation" ("clientUserId", "profileId")
  WHERE "eventDate" IS NULL;
