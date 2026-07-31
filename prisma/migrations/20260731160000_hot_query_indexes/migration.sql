-- CreateIndex
CREATE INDEX "FavoritePhotographer_profileId_createdAt_idx" ON "FavoritePhotographer"("profileId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Follow_followeeId_createdAt_idx" ON "Follow"("followeeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Like_createdAt_idx" ON "Like"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Photo_storyId_idx" ON "Photo"("storyId");
