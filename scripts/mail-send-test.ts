import 'dotenv/config';
import { verifyMailTransport, sendEmailStrict } from '@/lib/email';

/**
 * Проверка почты по РЕЗУЛЬТАТУ: соединение, а затем реальная отправка.
 *
 * «Настроено» и «работает» — разные вещи, и именно на этом различии платформа
 * простояла неделю с молча запертыми пользователями.
 */
async function main() {
  const to = process.env.MAIL_TEST_TO ?? '';
  if (!to) {
    console.error('MAIL_TEST_TO обязателен: адрес получателя');
    process.exit(1);
  }

  const res = await verifyMailTransport();
  console.log(res.ok ? 'соединение: ok' : `соединение: отказ — ${res.error}`);
  if (!res.ok) process.exit(1);

  const sent = await sendEmailStrict(
    to,
    'Репортаж Пост: проверка почты',
    'Письмо отправлено платформой после починки SMTP. Если вы его видите — транзакционная почта работает.',
  );
  console.log(sent.ok ? `письмо отправлено: ${to}` : `отправка не удалась: ${sent.error}`);
  process.exit(sent.ok ? 0 : 1);
  process.exit(0);
}

main().catch((e) => {
  console.error(String(e).slice(0, 300));
  process.exit(1);
});
