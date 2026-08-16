-- AlterTable
ALTER TABLE "PhotographerProfile" ADD COLUMN     "minPriceMinor" INTEGER;


-- Бэкфил: у существующих анкет минимум считается из уже записанных пакетов
UPDATE "PhotographerProfile" p
SET "minPriceMinor" = sub.min_price
FROM (
  SELECT "profileId", MIN("priceMinor") AS min_price
  FROM "PricePackage"
  GROUP BY "profileId"
) sub
WHERE sub."profileId" = p.id;
