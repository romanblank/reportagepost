-- CreateEnum
CREATE TYPE "TravelScope" AS ENUM ('NONE', 'NEARBY', 'COUNTRY', 'ABROAD');

-- AlterTable
ALTER TABLE "PhotographerProfile" ADD COLUMN     "hasIntlPassport" BOOLEAN,
ADD COLUMN     "travelScope" "TravelScope" NOT NULL DEFAULT 'NONE';

