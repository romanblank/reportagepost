-- Снятие неиспользуемого индекса ActivityEvent(type, createdAt) — аудит 2026-08-01, P2.
-- Ни один запрос не начинается с type без targetId: аналитика читает журнал по
-- объекту (src/lib/analytics.ts), а покрывающий индекс [targetType, targetId,
-- createdAt] остаётся. Третий индекс дорожал на самой частой записи платформы —
-- beacon просмотра пишет строку на каждый уникальный просмотр профиля.
--
-- SAFE-TO-ROLLBACK: удаляется только индекс, данные не затрагиваются;
-- обратная операция — CREATE INDEX по той же паре колонок.

-- DropIndex
DROP INDEX "ActivityEvent_type_createdAt_idx";
