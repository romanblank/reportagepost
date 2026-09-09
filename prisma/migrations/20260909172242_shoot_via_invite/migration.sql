-- AlterTable
ALTER TABLE "ShootConfirmation" ADD COLUMN     "viaInvite" BOOLEAN NOT NULL DEFAULT false;


-- Бэкфил: существующие записи с ipHash могли прийти только инвайт-путём
UPDATE "ShootConfirmation" SET "viaInvite" = true WHERE "ipHash" IS NOT NULL;
