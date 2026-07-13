-- CreateTable
CREATE TABLE "BusyDate" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "BusyDate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusyDate_date_idx" ON "BusyDate"("date");

-- CreateIndex
CREATE UNIQUE INDEX "BusyDate_profileId_date_key" ON "BusyDate"("profileId", "date");

-- AddForeignKey
ALTER TABLE "BusyDate" ADD CONSTRAINT "BusyDate_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PhotographerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
