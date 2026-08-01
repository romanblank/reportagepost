-- История адресов профиля (аудит 2026-08-01, P2): смена username больше не
-- обрывает все существующие ссылки — старый адрес отдаёт постоянный редирект.
-- SAFE-TO-ROLLBACK: только новая таблица, существующие данные не трогаются.

-- CreateTable
CREATE TABLE "UsernameHistory" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsernameHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsernameHistory_username_key" ON "UsernameHistory"("username");

-- CreateIndex
CREATE INDEX "UsernameHistory_profileId_idx" ON "UsernameHistory"("profileId");

-- AddForeignKey
ALTER TABLE "UsernameHistory" ADD CONSTRAINT "UsernameHistory_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PhotographerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
