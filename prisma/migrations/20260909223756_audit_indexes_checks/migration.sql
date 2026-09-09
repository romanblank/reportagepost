-- CreateIndex
CREATE INDEX "Comment_status_createdAt_idx" ON "Comment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PhotographerProfile_createdAt_idx" ON "PhotographerProfile"("createdAt");

-- CreateIndex
CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt");

-- CreateIndex
CREATE INDEX "Review_createdAt_idx" ON "Review"("createdAt");

-- CreateIndex
CREATE INDEX "ShootConfirmation_createdAt_idx" ON "ShootConfirmation"("createdAt");


-- Ограничения целостности в БД, а не только в коде (аудит 2026-09-10, П2):
-- zod на границе не защищает от ручного SQL и скриптов, а такие правки в
-- проекте уже случались. Тот же принцип, что у data_checks 2026-08-04.
ALTER TABLE "PricePackage" ADD CONSTRAINT "PricePackage_hours_positive"
  CHECK ("hours" > 0 AND "hours" <= 24);
ALTER TABLE "TravelPlan" ADD CONSTRAINT "TravelPlan_dates_ordered"
  CHECK ("toDate" >= "fromDate");
