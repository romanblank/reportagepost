-- Персональные инвайты (S3): атрибуция кто выдал
ALTER TABLE "InviteCode" ADD COLUMN "issuedByUserId" TEXT;
ALTER TABLE "InviteCode" ADD CONSTRAINT "InviteCode_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
