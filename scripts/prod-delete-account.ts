import 'dotenv/config';
import { db } from '@/lib/db';
import { deleteAccount, deletePhotographerProfile } from '@/lib/account';

/**
 * Удаление аккаунта или анкеты на проде — руками оператора.
 *
 * Живёт скриптом, а не кнопкой в админке, сознательно: это необратимое
 * удаление данных живого человека, и оно не должно быть в двух кликах от
 * обычной работы. Плюс с ноутбука оператора прод недоступен по сети, поэтому
 * единственный путь — Actions.
 *
 * Два режима:
 *  - `account` — аккаунт целиком, вместе с почтой и телефоном. Нужен, когда
 *    человек будет регистрироваться заново: занятая почта иначе не даст.
 *  - `profile` — только анкета фотографа. Вход и почта остаются, путь
 *    «подать анкету» проходится заново.
 *
 * Без CONFIRM=DELETE скрипт ничего не удаляет, а показывает, что нашёл. Это не
 * формальность: перепутанный email — это чужой удалённый аккаунт, и отката у
 * него нет.
 */
async function main() {
  const query = (process.env.QUERY ?? '').trim();
  const mode = (process.env.MODE ?? 'profile').trim();
  const confirm = (process.env.CONFIRM ?? '').trim();

  if (!query) {
    console.error('QUERY обязателен: email, username или «Имя Фамилия»');
    process.exit(1);
  }

  const [firstName, ...rest] = query.split(/\s+/);
  const lastName = rest.join(' ');

  const users = await db.user.findMany({
    where: {
      OR: [
        { email: { equals: query, mode: 'insensitive' } },
        { profile: { is: { username: { equals: query, mode: 'insensitive' } } } },
        ...(lastName
          ? [{
              AND: [
                { firstName: { equals: firstName, mode: 'insensitive' as const } },
                { lastName: { equals: lastName, mode: 'insensitive' as const } },
              ],
            }]
          : []),
      ],
    },
    select: {
      id: true, email: true, firstName: true, lastName: true, role: true, status: true, createdAt: true,
      profile: {
        select: {
          id: true, username: true, status: true,
          _count: { select: { photos: true, videos: true } },
        },
      },
    },
  });

  if (users.length === 0) {
    console.log(`Не найдено: ${query}`);
    process.exit(0);
  }

  for (const u of users) {
    console.log(
      `${u.firstName} ${u.lastName} <${u.email ?? 'без почты'}> · ${u.role}/${u.status} · ` +
        `создан ${u.createdAt.toISOString().slice(0, 10)} · ` +
        (u.profile
          ? `анкета @${u.profile.username} (${u.profile.status}), фото ${u.profile._count.photos}, видео ${u.profile._count.videos}`
          : 'анкеты нет'),
    );
  }

  // Больше одного совпадения — останавливаемся: «удалить того, кто первый в
  // списке» это ровно тот способ удалить не того человека
  if (users.length > 1) {
    console.error('Совпадений больше одного — уточните запрос (email или username).');
    process.exit(1);
  }

  const user = users[0];

  if (confirm !== 'DELETE') {
    console.log(`\nПоказан результат поиска. Для удаления запустите с CONFIRM=DELETE и MODE=${mode}.`);
    process.exit(0);
  }

  if (user.role === 'ADMIN' && mode === 'account') {
    console.error('Это администратор: удалять аккаунт целиком нельзя — снимите роль сначала.');
    process.exit(1);
  }

  if (mode === 'account') {
    await deleteAccount(user.id);
    console.log(`Удалён аккаунт целиком: ${user.email ?? user.id}`);
    process.exit(0);
  }

  if (!user.profile) {
    console.log('Анкеты нет — удалять нечего.');
    process.exit(0);
  }

  await deletePhotographerProfile(user.id);
  console.log(
    `Анкета @${user.profile.username} удалена. Аккаунт, почта и пароль сохранены — ` +
      'путь «подать анкету» проходится заново из кабинета.',
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
