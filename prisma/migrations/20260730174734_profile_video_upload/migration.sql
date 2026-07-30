-- CreateTable
CREATE TABLE "ProfileVideo" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "title" TEXT,
    "posterKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfileVideo_storageKey_key" ON "ProfileVideo"("storageKey");

-- CreateIndex
CREATE INDEX "ProfileVideo_profileId_status_idx" ON "ProfileVideo"("profileId", "status");

-- AddForeignKey
ALTER TABLE "ProfileVideo" ADD CONSTRAINT "ProfileVideo_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PhotographerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
