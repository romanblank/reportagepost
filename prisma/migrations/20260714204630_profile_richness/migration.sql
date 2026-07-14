-- Богатство анкеты (паритет MyWed): стаж, оборудование, команда
ALTER TABLE "PhotographerProfile" ADD COLUMN "experienceYears" INTEGER;
ALTER TABLE "PhotographerProfile" ADD COLUMN "equipment" TEXT;
ALTER TABLE "PhotographerProfile" ADD COLUMN "teamInfo" TEXT;
