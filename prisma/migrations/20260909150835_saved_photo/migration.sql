-- CreateTable
CREATE TABLE "SavedPhoto" (
    "userId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedPhoto_pkey" PRIMARY KEY ("userId","photoId")
);

-- CreateIndex
CREATE INDEX "SavedPhoto_userId_createdAt_idx" ON "SavedPhoto"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SavedPhoto" ADD CONSTRAINT "SavedPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPhoto" ADD CONSTRAINT "SavedPhoto_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

