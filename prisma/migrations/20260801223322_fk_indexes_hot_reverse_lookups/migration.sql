-- Индексы на FK-колонках горячих обратных выборок (аудит 2026-08-01, P2).
-- В Postgres Prisma НЕ создаёт индекс под внешний ключ автоматически: выборка
-- «мои подписчики» (Follow.followeeId), сохранения профиля в дашборде
-- подписчика (FavoritePhotographer.profileId) и фильтр каталога по жанру
-- (ProfileCategory.categoryId) шли seq scan-ом. Плюс все эти FK стоят
-- ON DELETE RESTRICT — без индекса каждое удаление родителя сканирует ребёнка
-- целиком (этим же болел deleteAccount).
--
-- Обычный CREATE INDEX (не CONCURRENTLY): Prisma гоняет миграции в транзакции,
-- где CONCURRENTLY запрещён. На текущих объёмах закрытой беты блокировка —
-- миллисекунды; при росте до сотен тысяч строк такие индексы добавлять вручную
-- CONCURRENTLY вне migrate.
--
-- SAFE-TO-ROLLBACK: только добавление индексов, данные не трогаются.

-- CreateIndex
CREATE INDEX "FavoritePhotographer_profileId_idx" ON "FavoritePhotographer"("profileId");

-- CreateIndex
CREATE INDEX "Follow_followeeId_idx" ON "Follow"("followeeId");

-- CreateIndex
CREATE INDEX "Inquiry_clientUserId_idx" ON "Inquiry"("clientUserId");

-- CreateIndex
CREATE INDEX "Inquiry_categoryId_idx" ON "Inquiry"("categoryId");

-- CreateIndex
CREATE INDEX "Like_userId_idx" ON "Like"("userId");

-- CreateIndex
CREATE INDEX "ProfileCategory_categoryId_idx" ON "ProfileCategory"("categoryId");

-- CreateIndex
CREATE INDEX "Review_authorUserId_idx" ON "Review"("authorUserId");

-- CreateIndex
CREATE INDEX "Story_categoryId_idx" ON "Story"("categoryId");
