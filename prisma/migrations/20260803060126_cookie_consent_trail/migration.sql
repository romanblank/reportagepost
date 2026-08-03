-- CreateTable
CREATE TABLE "CookieConsent" (
    "id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "ipHash" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CookieConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CookieConsent_createdAt_idx" ON "CookieConsent"("createdAt");

-- CreateIndex
CREATE INDEX "CookieConsent_userId_idx" ON "CookieConsent"("userId");
