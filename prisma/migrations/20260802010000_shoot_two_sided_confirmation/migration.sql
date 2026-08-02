-- Двустороннее подтверждение съёмки (S4 trust-хардеринг, 2026-08-02).
--
-- Отметку «мы снимали вместе» ставил только заказчик, и она сразу становилась
-- публичной: давала факты «снимали вместе N раз» и признак verified у отзыва.
-- При открытой регистрации (S4 снимает инвайт-гейт) этого достаточно, чтобы
-- автор завёл фейковых «заказчиков» и накрутил себе доверие — то есть подорвал
-- ровно то, на чём держится доброжелательный рейтинг.
--
-- Теперь отметка ждёт подтверждения фотографа. Существующие записи переводим в
-- CONFIRMED: они созданы в закрытой бете, где действовал инвайт-гейт и уже
-- работала проверка на двустороннюю переписку — обнулять реальным людям
-- накопленные факты было бы нечестно.
--
-- Уникальность (клиент, профиль, дата) не даёт повторно отметить ОДНУ съёмку;
-- разные даты по-прежнему законны — это и есть «заказчики возвращаются».
-- Записи без даты уникальный индекс не ловит (в SQL NULL ≠ NULL), поэтому
-- дедуп по датам продублирован в shootStats.
--
-- SAFE-TO-ROLLBACK: добавление колонок с дефолтом и индексов; данные не теряются.

-- CreateEnum
CREATE TYPE "ShootConfirmState" AS ENUM ('PENDING', 'CONFIRMED', 'DISPUTED');

-- DropIndex
DROP INDEX "ShootConfirmation_profileId_createdAt_idx";

-- AlterTable
ALTER TABLE "ShootConfirmation" ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "state" "ShootConfirmState" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "ShootConfirmation_profileId_state_createdAt_idx" ON "ShootConfirmation"("profileId", "state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShootConfirmation_clientUserId_profileId_eventDate_key" ON "ShootConfirmation"("clientUserId", "profileId", "eventDate");


-- Бэкфилл: всё, что подтверждено до введения двусторонней модели, остаётся в силе
UPDATE "ShootConfirmation" SET "state" = 'CONFIRMED', "respondedAt" = "createdAt" WHERE "state" = 'PENDING';
