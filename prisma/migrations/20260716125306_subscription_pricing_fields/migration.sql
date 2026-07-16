-- DropForeignKey
ALTER TABLE "PasswordReset" DROP CONSTRAINT "PasswordReset_userId_fkey";

-- DropForeignKey
ALTER TABLE "RecoveryCode" DROP CONSTRAINT "RecoveryCode_userId_fkey";

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cityTier" TEXT,
ADD COLUMN     "graceEndsAt" TIMESTAMP(3),
ADD COLUMN     "priceMinorLocked" INTEGER,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
