-- Telegram: одноразовый код привязки аккаунта (deep-link /start)
ALTER TABLE "User" ADD COLUMN "tgLinkCode" TEXT;
CREATE UNIQUE INDEX "User_tgLinkCode_key" ON "User"("tgLinkCode");
