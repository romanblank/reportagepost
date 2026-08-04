-- Ограничения уровня базы на инварианты, которые до сих пор держались ТОЛЬКО кодом.
--
-- Разница принципиальная: guard в приложении защищает от ошибки в одном месте,
-- а CHECK — от ошибки в любом будущем коде, в скрипте и в ручном SQL оператора
-- (что в этом проекте уже случалось — правка _prisma_migrations руками).
--
-- Оценка публичного рейтинга и суммы платежей — ровно те места, где неверное
-- значение бьёт по деньгам и по выдаче, причём молча: формула просто посчитает
-- искажённый результат, не выбросив ошибки.
--
-- SAFE-TO-ROLLBACK: ограничения только запрещают заведомо неверные значения,
-- прежний код таких не пишет — откат образа безопасен.

ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range"
  CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive"
  CHECK ("amountMinor" > 0);

ALTER TABLE "PricePackage" ADD CONSTRAINT "PricePackage_price_positive"
  CHECK ("priceMinor" > 0);

ALTER TABLE "Photo" ADD CONSTRAINT "Photo_dimensions_positive"
  CHECK ("width" > 0 AND "height" > 0);

ALTER TABLE "Like" ADD CONSTRAINT "Like_weight_nonnegative"
  CHECK ("weightMilli" >= 0);
