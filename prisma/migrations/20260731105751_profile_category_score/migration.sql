-- CreateTable
CREATE TABLE "ProfileCategoryScore" (
    "profileId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "scoreMilli" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileCategoryScore_pkey" PRIMARY KEY ("profileId","categoryId")
);

-- CreateIndex
CREATE INDEX "ProfileCategoryScore_categoryId_scoreMilli_idx" ON "ProfileCategoryScore"("categoryId", "scoreMilli" DESC);

-- AddForeignKey
ALTER TABLE "ProfileCategoryScore" ADD CONSTRAINT "ProfileCategoryScore_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PhotographerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileCategoryScore" ADD CONSTRAINT "ProfileCategoryScore_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
