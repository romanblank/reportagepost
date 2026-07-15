-- Согласие на обработку ПДн (152-ФЗ) при открытой регистрации
ALTER TABLE "User" ADD COLUMN "pdnConsentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pdnConsentVersion" TEXT;
