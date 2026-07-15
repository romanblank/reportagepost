-- B1 CAB-2: порядок фото в портфолио + выбранная обложка каталога
ALTER TABLE "Photo" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Photo_profileId_sortOrder_idx" ON "Photo"("profileId", "sortOrder");
ALTER TABLE "PhotographerProfile" ADD COLUMN "coverPhotoId" TEXT;
-- бэкфилл порядка по времени загрузки (стабильная стартовая раскладка)
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "profileId" ORDER BY "uploadedAt" ASC) AS rn
  FROM "Photo"
)
UPDATE "Photo" p SET "sortOrder" = r.rn FROM ranked r WHERE p."id" = r."id";
