import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';

// Серии/истории (модель MyWed): репортаж с одного события — подборка одобренных
// фото фотографа. Публикация серии проходит модерацию отдельно.

export const STORY_MIN_PHOTOS = 5;
export const STORY_MAX_PHOTOS = 60;

export async function createStory(
  userId: string,
  input: { title: string; description?: string; categorySlug: string; photoIds: string[] },
): Promise<{ storyId: string }> {
  const profile = await db.photographerProfile.findUnique({ where: { userId } });
  if (!profile || profile.status !== 'APPROVED') throw new DomainError('profile_not_approved', 403);

  if (input.photoIds.length < STORY_MIN_PHOTOS || input.photoIds.length > STORY_MAX_PHOTOS) {
    throw new DomainError('photo_count', 400);
  }
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

export async function toggleStoryLike(userId: string, storyId: string): Promise<{ liked: boolean }> {
  const story = await db.story.findUnique({ where: { id: storyId } });
  if (!story || story.status !== 'APPROVED') throw new DomainError('story_not_found', 404);

  const existing = await db.like.findUnique({ where: { userId_storyId: { userId, storyId } } });
  if (existing) {
    await db.$transaction([
      db.like.delete({ where: { id: existing.id } }),
      db.activityEvent.create({
        data: { actorUserId: userId, type: 'STORY_UNLIKE', targetType: 'STORY', targetId: storyId, weightMilli: existing.weightMilli },
      }),
    ]);
    return { liked: false };
  }

  const profile = await db.photographerProfile.findUnique({ where: { userId }, select: { status: true } });
  const weightMilli = profile?.status === 'APPROVED' ? 2000 : 1000;
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
  return { liked: true };
}

/** Одобрение серии редакцией: публикует + событие STORY_PUBLISH. */
export async function approveStory(storyId: string): Promise<void> {
  const story = await db.story.findUnique({ where: { id: storyId }, include: { profile: true } });
  if (!story) throw new DomainError('story_not_found', 404);
  await db.$transaction([
    db.story.update({ where: { id: storyId }, data: { status: 'APPROVED', publishedAt: new Date() } }),
    db.activityEvent.create({
      data: { actorUserId: story.profile.userId, type: 'STORY_PUBLISH', targetType: 'STORY', targetId: storyId },
    }),
  ]);
}

export async function rejectStory(storyId: string, reason: string): Promise<void> {
  await db.story.update({ where: { id: storyId }, data: { status: 'REJECTED', rejectReason: reason } });
}
