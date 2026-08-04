import Link from 'next/link';
import { ru } from '@/i18n/ru';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-6xl font-semibold text-accent">404</p>
      <h1 className="mt-4 t-h2">{ru.notFound.title}</h1>
      <p className="mt-2 muted">{ru.notFound.text}</p>
      <Link href="/" className="btn btn-accent mt-6">{ru.notFound.home}</Link>
    </main>
  );
}
