-- CreateEnum
CREATE TYPE "VideoProcessing" AS ENUM ('UPLOADED', 'PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "ProfileVideo" ADD COLUMN     "codec" TEXT,
ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "hdKey" TEXT,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "processedBytes" INTEGER,
ADD COLUMN     "processing" "VideoProcessing" NOT NULL DEFAULT 'UPLOADED',
ADD COLUMN     "sdKey" TEXT,
ADD COLUMN     "width" INTEGER;

-- CreateIndex
CREATE INDEX "ProfileVideo_processing_createdAt_idx" ON "ProfileVideo"("processing", "createdAt");
