-- AlterTable
ALTER TABLE "Like" ADD COLUMN     "weightMilli" INTEGER NOT NULL DEFAULT 1000;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
