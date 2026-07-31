-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'RUB';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'RUB';
