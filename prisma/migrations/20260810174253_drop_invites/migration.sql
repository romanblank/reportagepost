-- SAFE-TO-ROLLBACK: прежний образ отличается от нового ТОЛЬКО наличием механики
-- приглашений, и на единственном оставшемся пути (регистрация без кода) он
-- обращался бы к удалённой колонке при вставке пользователя. Поэтому откат на
-- него делается вместе с откатом этой миграции, а не отдельно; иной причины
-- возвращаться к тому образу нет — функциональной разницы больше никакой.
--
-- Данные: 10 кодов, из них воспользовался один аккаунт (владельца платформы).
-- Атрибуция «кто кого привёл» здесь ничего не значила.

-- DropForeignKey
ALTER TABLE "InviteCode" DROP CONSTRAINT "InviteCode_issuedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_inviteCodeId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "inviteCodeId";

-- DropTable
DROP TABLE "InviteCode";

