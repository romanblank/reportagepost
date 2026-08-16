-- Ровно одна цель у лайка и комментария (аудит 2026-08-16, P2).
-- Код всегда пишет либо photoId, либо storyId, но БД это не требовала: баг в
-- будущем коде или ручной SQL могли создать запись без цели (не попадает ни в
-- один счётчик) или с обеими (задвоенный вес в engagement). Принцип проекта:
-- CHECK — от ошибки в ЛЮБОМ будущем коде, не только в сегодняшнем.
ALTER TABLE "Like" ADD CONSTRAINT "Like_target_xor"
  CHECK (("photoId" IS NOT NULL) <> ("storyId" IS NOT NULL));
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_target_xor"
  CHECK (("photoId" IS NOT NULL) <> ("storyId" IS NOT NULL));
