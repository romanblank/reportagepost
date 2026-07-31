-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyInquiriesEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyInquiriesTg" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unsubToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_unsubToken_key" ON "User"("unsubToken");

