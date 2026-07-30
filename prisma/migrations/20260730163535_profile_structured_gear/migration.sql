-- AlterTable
ALTER TABLE "PhotographerProfile" ADD COLUMN     "cameras" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lenses" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lighting" TEXT[] DEFAULT ARRAY[]::TEXT[];
