-- Персональные отметки фотографа по веерной заявке (аудит 2026-08-01, P2).
-- Общий Inquiry.status не годится: заявку видят все фотографы города, и один
-- закрыл бы её для всех. SAFE-TO-ROLLBACK: только новая таблица и enum.

-- CreateEnum
CREATE TYPE "HandlingState" AS ENUM ('IN_PROGRESS', 'DECLINED');

-- CreateTable
CREATE TABLE "InquiryHandling" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "state" "HandlingState" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InquiryHandling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InquiryHandling_profileId_state_idx" ON "InquiryHandling"("profileId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "InquiryHandling_inquiryId_profileId_key" ON "InquiryHandling"("inquiryId", "profileId");

-- AddForeignKey
ALTER TABLE "InquiryHandling" ADD CONSTRAINT "InquiryHandling_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryHandling" ADD CONSTRAINT "InquiryHandling_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PhotographerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
