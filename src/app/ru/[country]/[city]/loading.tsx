// Скелетон каталога (perceived speed): пульсирующие карточки во время SSR.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-surface-2" />
      <div className="mt-6 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-surface-2" />
        ))}
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="aspect-[3/1] animate-pulse bg-surface-2" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-48 animate-pulse rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
