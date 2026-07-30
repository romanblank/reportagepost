-- CreateIndex
CREATE INDEX "Like_photoId_createdAt_idx" ON "Like"("photoId", "createdAt");

-- CreateIndex
CREATE INDEX "Photo_status_editorsChoiceAt_publishedAt_idx" ON "Photo"("status", "editorsChoiceAt" DESC, "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Photo_categoryId_status_idx" ON "Photo"("categoryId", "status");

-- CreateIndex
CREATE INDEX "Review_status_rating_verified_idx" ON "Review"("status", "rating", "verified");

-- CreateIndex
CREATE INDEX "Story_status_publishedAt_idx" ON "Story"("status", "publishedAt" DESC);
