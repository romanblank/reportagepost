import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { likeWeightFor } from '@/lib/rating';
import { tierOf } from '@/lib/subscription';

// Серии/истории (модель MyWed): репортаж с одного события — подборка одобренных
// фото фотографа. Публикация серии проходит модерацию отдельно.

export { STORY_MIN_PHOTOS, STORY_MAX_PHOTOS } from '@/lib/stories-constants';
import { STORY_MIN_PHOTOS, STORY_MAX_PHOTOS } from '@/lib/stories-constants';
// Кап незакрытых заявок на модерацию (аудит P3: анти-спам очереди редакции)
export const MAX_PENDING_STORIES = 5;

export async function createStory(
  userId: string,
  input: { title: string; description?: string; categorySlug: string; photoIds: string[] },
): Promise<{ storyId: string }> {
  const profile = await db.photographerProfile.findUnique({ where: { userId } });
  if (!profile || profile.status !== 'APPROVED') throw new DomainError('profile_not_approved', 403);

  // Серии — перк подписки Active/Active+ (обещано в «портфолио без ограничений и серии»).
  if ((await tierOf(userId)) === 'FREE') throw new DomainError('stories_require_active', 403);

  if (input.photoIds.length < STORY_MIN_PHOTOS || input.photoIds.length > STORY_MAX_PHOTOS) {
    throw new DomainError('photo_count', 400);
  }
  const pending = await db.story.count({ where: { profileId: profile.id, status: 'PENDING' } });
  if (pending >= MAX_PENDING_STORIES) throw new DomainError('too_many_pending', 429);
  const category = await db.category.findUnique({ where: { slug: input.categorySlug } });
  if (!category?.active) throw new DomainError('category_not_found', 400);

  // Все фото должны принадлежать этому профилю и быть одобрены (IDOR-защита)
  const photos = await db.photo.findMany({
    where: { id: { in: input.photoIds }, profileId: profile.id, status: 'APPROVED' },
    select: { id: true },
  });
  if (photos.length !== input.photoIds.length) throw new DomainError('invalid_photos', 400);

  const story = await db.story.create({
    data: {
      profileId: profile.id,
      categoryId: category.id,
      title: input.title,
      description: input.description,
      coverPhotoId: input.photoIds[0],
      // фото привязываются к серии через storyId
      photos: { connect: input.photoIds.map((id) => ({ id })) },
    },
  });
  return { storyId: story.id };
}

/** Пересчёт рейтинга после лайка серии — см. комментарий в engagement.ts. */
async function recomputeAfterStoryLike(profileId: string): Promise<void> {
  try {
    const { recomputeOne } = await import('@/lib/rating');
    await recomputeOne(profileId);
  } catch {
    // порядок обновится плановым пересчётом
  }
}

export async function toggleStoryLike(userId: string, storyId: string): Promise<{ liked: boolean }> {
  const story = await db.story.findUnique({
    where: { id: storyId },
    include: { profile: { select: { userId: true } } },
  });
  if (!story || story.status !== 'APPROVED') throw new DomainError('story_not_found', 404);
  // Самолайк запрещён (аудит 2026-07-31): лайки серий идут в тот же рейтинг
  if (story.profile.userId === userId) throw new DomainError('self_like', 400);

  const existing = await db.like.findUnique({ where: { userId_storyId: { userId, storyId } } });
  if (existing) {
    const removed = await db.like.deleteMany({ where: { userId, storyId } });
    if (removed.count > 0) {
      await db.activityEvent.create({
        data: { actorUserId: userId, type: 'STORY_UNLIKE', targetType: 'STORY', targetId: storyId, weightMilli: existing.weightMilli },
      });
      await recomputeAfterStoryLike(story.profileId);
    }
    return { liked: false };
  }

  const profile = await db.photographerProfile.findUnique({ where: { userId }, select: { status: true } });
  const weightMilli = likeWeightFor(profile?.status);
  try {
    await db.$transaction([
      db.like.create({ data: { userId, storyId, weightMilli } }),
      db.activityEvent.create({
        data: { actorUserId: userId, type: 'STORY_LIKE', targetType: 'STORY', targetId: storyId, weightMilli },
      }),
    ]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { liked: true };
    throw e;
  }
  await recomputeAfterStoryLike(story.profileId);
  return { liked: true };
}

/** Одобрение серии редакцией: публикует + событие STORY_PUBLISH + уведомление. */
export async function approveStory(storyId: string): Promise<void> {
  const story = await db.story.findUnique({ where: { id: storyId }, include: { profile: true } });
  if (!story) throw new DomainError('story_not_found', 404);
  if (story.status !== 'PENDING') return; // идемпотентность: уже обработана — без дубль-событий
  await db.$transaction([
    db.story.update({ where: { id: storyId }, data: { status: 'APPROVED', publishedAt: new Date() } }),
    db.activityEvent.create({
      data: { actorUserId: story.profile.userId, type: 'STORY_PUBLISH', targetType: 'STORY', targetId: storyId },
    }),
  ]);
  const { notifyInApp } = await import('@/lib/notifications');
  await notifyInApp(story.profile.userId, 'notification.story.approved', { storyId }).catch(() => {});
}

export async function rejectStory(storyId: string, reason: string): Promise<void> {
  const existing = await db.story.findUnique({ where: { id: storyId }, select: { status: true } });
  if (!existing) throw new DomainError('story_not_found', 404);
  if (existing.status !== 'PENDING') return; // идемпотентность: уже обработана — no-op
  const story = await db.story.update({
    where: { id: storyId },
    data: { status: 'REJECTED', rejectReason: reason },
    select: { profile: { select: { userId: true } } },
  });
  const { notifyInApp } = await import('@/lib/notifications');
  await notifyInApp(story.profile.userId, 'notification.story.rejected', { storyId }).catch(() => {});
}
