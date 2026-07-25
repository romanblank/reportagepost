-- Prime/Elite: разворот тарифов (синергия, не классовость, 2026-07-25).
-- Существующие PRO-подписки становятся PRIME (RENAME сохраняет строки), + ELITE.
ALTER TYPE "SubscriptionTier" RENAME VALUE 'PRO' TO 'PRIME';
ALTER TYPE "SubscriptionTier" ADD VALUE 'ELITE';

-- Каталог merit-first: ratingScore перед proRank (подписка — мягкий tiebreaker,
-- не pay-for-position).
DROP INDEX IF EXISTS "PhotographerProfile_cityId_status_proRank_ratingScore_idx";
CREATE INDEX "PhotographerProfile_cityId_status_ratingScore_proRank_idx" ON "PhotographerProfile"("cityId", "status", "ratingScore" DESC, "proRank" DESC);
