-- A2/A3: аудит-лог админа + статусы модерации DRAFT/NEEDS_REVISION + revisionNote
ALTER TYPE "ModerationStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ModerationStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVISION';
ALTER TABLE "PhotographerProfile" ADD COLUMN "revisionNote" TEXT;
CREATE TABLE "AdminAudit" (
  "id" BIGSERIAL NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminAudit_actorUserId_createdAt_idx" ON "AdminAudit"("actorUserId", "createdAt");
CREATE INDEX "AdminAudit_targetType_targetId_createdAt_idx" ON "AdminAudit"("targetType", "targetId", "createdAt");
CREATE INDEX "AdminAudit_action_createdAt_idx" ON "AdminAudit"("action", "createdAt");
ALTER TABLE "AdminAudit" ADD CONSTRAINT "AdminAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
