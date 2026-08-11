import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { articleBySlug } from '@/lib/articles';
import { webVariantUrl } from '@/lib/photos';
import { formatDateRu } from '@/lib/date-format';
import { BASE_URL } from '@/lib/sitemap';
import { JsonLd } from '@/components/JsonLd';
import { articleLd, breadcrumbLd } from '@/lib/structured-data';
import { ru } from '@/i18n/ru';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = await articleBySlug(slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.lead,
    alternates: { canonical: `${BASE_URL}/ru/journal/${slug}` },
    openGraph: {
      title: article.title,
      description: article.lead,
      type: 'article',
      images: article.coverKey ? [webVariantUrl(article.coverKey)] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = await articleBySlug(slug);
  if (!article) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
      <JsonLd
        data={articleLd({
          title: article.title,
          lead: article.lead,
          url: `${BASE_URL}/ru/journal/${slug}`,
          publishedAt: article.publishedAt,
          authorName: article.authorName,
          imageUrl: article.coverKey ? webVariantUrl(article.coverKey) : null,
        })}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: ru.nav.journal, path: '/ru/journal' },
          { name: article.title, path: `/ru/journal/${slug}` },
        ])}
      />

      <Link href="/ru/journal" className="text-sm underline muted">← {ru.nav.journal}</Link>
      <h1 className="t-h1 mt-3 text-balance">{article.title}</h1>
      <p className="t-caption mt-3 muted">
        {article.authorUsername ? (
          <Link href={`/ru/photographer/${article.authorUsername}`} className="underline">{article.authorName}</Link>
        ) : (
          article.authorName
        )}
        {' · '}
        {formatDateRu(article.publishedAt)}
      </p>

      {article.coverKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={webVariantUrl(article.coverKey)}
          alt=""
          className="mt-6 w-full rounded-media"
        />
      ) : null}

      <p className="mt-6 t-body-lg">{article.lead}</p>
      <div className="mt-4 whitespace-pre-wrap text-base leading-relaxed">{article.body}</div>
    </main>
  );
}
