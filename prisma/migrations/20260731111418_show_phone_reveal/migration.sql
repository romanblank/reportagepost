-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'PHONE_REVEAL';

-- AlterTable
ALTER TABLE "PhotographerProfile" ADD COLUMN     "showPhone" BOOLEAN NOT NULL DEFAULT false;
