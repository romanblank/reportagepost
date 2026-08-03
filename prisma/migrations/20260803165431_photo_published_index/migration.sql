-- CreateIndex
CREATE INDEX "Photo_profileId_status_publishedAt_idx" ON "Photo"("profileId", "status", "publishedAt" DESC);

