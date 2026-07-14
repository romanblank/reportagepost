import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { avatarUrl } from '@/lib/photos';
import { parseFaq } from '@/lib/faq';
import { ru } from '@/i18n/ru';
import { EditProfileForm } from './EditProfileForm';

export const metadata: Metadata = { title: ru.editProfile.title };
export const dynamic = 'force-dynamic';

export default async function EditProfilePage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');
  if (session.role !== 'PHOTOGRAPHER') redirect('/ru/cabinet');

  const profile = await db.photographerProfile.findUnique({
    where: { userId: session.userId },
    include: { packages: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!profile) redirect('/ru/onboarding');

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-semibold sm:text-3xl">{ru.editProfile.title}</h1>
      <EditProfileForm
        avatar={profile.avatarKey ? avatarUrl(profile.avatarKey) : null}
        initial={{
          bio: profile.bio ?? '',
          siteUrl: profile.siteUrl ?? '',
          whatsapp: profile.whatsapp ?? '',
          telegram: profile.telegram ? `@${profile.telegram}` : '',
          experienceYears: profile.experienceYears ?? null,
          equipment: profile.equipment ?? '',
          teamInfo: profile.teamInfo ?? '',
          languages: profile.languages,
          faq: parseFaq(profile.faq),
          packages: profile.packages.map((p) => ({ hours: p.hours, priceRub: Math.round(p.priceMinor / 100) })),
        }}
      />
    </main>
  );
}
