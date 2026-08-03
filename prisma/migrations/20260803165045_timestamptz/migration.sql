-- Часовой пояс на колонках времени.
--
-- Инвариант проекта — «UTC в базе» — держался только на том, что приложение
-- всегда пишет UTC, а сессия PostgreSQL всегда в UTC. Сам тип timestamp зоны
-- не хранит: любой прямой доступ (psql с другим TimeZone, аналитика, restore
-- на сервер с иным GUC, будущая реплика в другом регионе) молча читал бы и
-- писал время со сдвигом, без единой ошибки.
--
-- Данные уже фактически в UTC, поэтому преобразование безопасно: PostgreSQL
-- трактует значение как локальное для сессии, а сессия у нас UTC.
--
-- SAFE-TO-ROLLBACK: прежний код читает timestamptz так же — драйвер отдаёт Date
-- в обоих случаях, ничего не ломается при откате образа.

-- AlterTable
ALTER TABLE "ActivityEvent" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "AdminAudit" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Comment" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "CookieConsent" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "EmailVerification" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "usedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "FavoritePhotographer" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Follow" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Inquiry" ALTER COLUMN "eventDate" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "pdnConsentAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "InquiryHandling" ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "InviteCode" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "JobRun" ALTER COLUMN "startedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "finishedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Like" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "readAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "sentAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "readAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "PasswordReset" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "usedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "PhoneVerification" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Photo" ALTER COLUMN "uploadedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "publishedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "editorsChoiceAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "PhotographerProfile" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ProfileCategoryScore" ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ProfileVideo" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "processedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "RateLimit" DROP CONSTRAINT "RateLimit_pkey",
ALTER COLUMN "windowStart" SET DATA TYPE TIMESTAMPTZ(3),
ADD CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key", "windowStart");

-- AlterTable
ALTER TABLE "RecoveryCode" ALTER COLUMN "usedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Report" ALTER COLUMN "resolvedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "repliedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ShootConfirmation" ALTER COLUMN "eventDate" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "respondedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Story" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "publishedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Subscription" ALTER COLUMN "currentPeriodEnd" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "graceEndsAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "trialEndsAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "proRequestedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "phoneVerifiedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "lastSeenAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "passwordChangedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "pdnConsentAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "twoFactorEnabledAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "emailVerifiedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "UserBlock" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "UsernameHistory" ALTER COLUMN "changedAt" SET DATA TYPE TIMESTAMPTZ(3);

