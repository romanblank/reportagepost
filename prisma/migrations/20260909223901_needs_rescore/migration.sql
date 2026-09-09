-- AlterTable
ALTER TABLE "PhotographerProfile" ADD COLUMN     "needsRescore" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PhotographerProfile_needsRescore_idx" ON "PhotographerProfile"("needsRescore");

