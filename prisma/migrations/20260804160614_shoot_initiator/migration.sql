-- CreateEnum
CREATE TYPE "ShootInitiator" AS ENUM ('CLIENT', 'PHOTOGRAPHER');

-- AlterTable
ALTER TABLE "ShootConfirmation" ADD COLUMN     "initiatedBy" "ShootInitiator" NOT NULL DEFAULT 'CLIENT';

