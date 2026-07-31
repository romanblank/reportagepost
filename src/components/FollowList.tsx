import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { cityNameRu } from '@/lib/geo-data';
import { Avatar } from '@/components/ui/Avatar';
import type { FollowEntry } from '@/lib/follow-lists';

// Follow-список (паритет MyWed): фотографы — карточкой со ссылкой на профиль,
// заказчики — именем без ссылки (публичной страницы у них нет).
export function FollowList({ entries }: { entries: FollowEntry[] }) {
  if (entries.length === 0) {
    return <p className="mt-6 text-sm muted">{ru.followList.empty}</p>;
  }
  return (
    <ul className="mt-6 flex flex-col gap-1">
      {entries.map((e, i) => {
        const inner = (
          <>
            <Avatar avatarKey={e.avatarKey} firstName={e.firstName} lastName={e.lastName} size={44} />
            <span className="min-w-0">
              <span className="block truncate font-medium">{e.firstName} {e.lastName}</span>
              <span className="block truncate text-xs muted">
                {e.username ? `@${e.username}${e.city ? ` · ${cityNameRu(e.city)}` : ''}` : ru.followList.clientLabel}
              </span>
            </span>
          </>
        );
        return (
          <li key={`${e.username ?? 'client'}-${i}`}>
            {e.username ? (
              <Link href={`/ru/photographer/${e.username}`}
                className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-surface-2">
                {inner}
              </Link>
            ) : (
              <span className="flex items-center gap-3 px-2 py-2">{inner}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
