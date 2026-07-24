-- Приоритет PRO в каталоге (денормализованный proRank)
ALTER TABLE "PhotographerProfile" ADD COLUMN "proRank" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "PhotographerProfile_cityId_status_ratingScore_idx";
CREATE INDEX "PhotographerProfile_cityId_status_proRank_ratingScore_idx"
  ON "PhotographerProfile"("cityId", "status", "proRank" DESC, "ratingScore" DESC);
