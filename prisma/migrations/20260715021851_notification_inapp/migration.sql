-- In-app центр уведомлений: канал IN_APP + read-state
ALTER TYPE "NotificationChannel" ADD VALUE 'IN_APP';
ALTER TABLE "Notification" ADD COLUMN "readAt" TIMESTAMP(3);
