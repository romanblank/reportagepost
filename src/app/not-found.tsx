import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-6xl font-semibold text-accent">404</p>
      <h1 className="mt-4 text-2xl font-semibold">Страница не найдена</h1>
      <p className="mt-2 muted">Возможно, ссылка устарела или страница была перемещена.</p>
      <Link href="/" className="btn btn-accent mt-6">На главную</Link>
    </main>
  );
}
