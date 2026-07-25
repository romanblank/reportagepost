-- Подтверждённая съёмка (честный якорь доверия, доброжелательная система).
CREATE TABLE "ShootConfirmation" (
    "id" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShootConfirmation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShootConfirmation_profileId_createdAt_idx" ON "ShootConfirmation"("profileId", "createdAt");
CREATE INDEX "ShootConfirmation_clientUserId_profileId_idx" ON "ShootConfirmation"("clientUserId", "profileId");
ALTER TABLE "ShootConfirmation" ADD CONSTRAINT "ShootConfirmation_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShootConfirmation" ADD CONSTRAINT "ShootConfirmation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PhotographerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
