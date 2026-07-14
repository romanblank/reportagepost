-- Отзывы клиентов о фотографах (паритет MyWed)
CREATE TABLE "Review" (
  "id" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "status" "CommentStatus" NOT NULL DEFAULT 'VISIBLE',
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "reply" TEXT,
  "repliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Review_authorUserId_profileId_key" ON "Review"("authorUserId", "profileId");
CREATE INDEX "Review_profileId_status_createdAt_idx" ON "Review"("profileId", "status", "createdAt");
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PhotographerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
