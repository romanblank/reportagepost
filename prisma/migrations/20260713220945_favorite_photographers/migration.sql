-- CreateTable
CREATE TABLE "FavoritePhotographer" (
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoritePhotographer_pkey" PRIMARY KEY ("userId","profileId")
);

-- CreateIndex
CREATE INDEX "FavoritePhotographer_userId_idx" ON "FavoritePhotographer"("userId");

-- AddForeignKey
ALTER TABLE "FavoritePhotographer" ADD CONSTRAINT "FavoritePhotographer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoritePhotographer" ADD CONSTRAINT "FavoritePhotographer_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PhotographerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
