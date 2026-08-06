import 'dotenv/config';
import { verifyMailTransport, emailConfigured } from '@/lib/email';

/**
 * Проверка почты по РЕЗУЛЬТАТУ, а не по наличию ключей.
 *
 * «Настроено» и «работает» — разные вещи: именно на этом различии платформа
 * стояла с молча запертыми пользователями. Печатаем дословный отказ сервера,
 * потому что по коду 535/538 понятно, что чинить, а по «не отправилось» — нет.
 */
async function main() {
  console.log('SMTP_HOST:', process.env.SMTP_HOST ?? '(нет)');
  console.log('SMTP_PORT:', process.env.SMTP_PORT ?? '(нет)');
  console.log('SMTP_USER:', process.env.SMTP_USER ? '(задан)' : '(нет)');
  console.log('SMTP_PASS:', process.env.SMTP_PASS ? '(задан)' : '(нет)');
  console.log('MAIL_FROM:', process.env.MAIL_FROM ?? '(нет)');
  console.log('EMAIL_GATE:', process.env.EMAIL_GATE ?? '(не задан → гейт активен, если почта настроена)');
  console.log('emailConfigured():', emailConfigured());

  const res = await verifyMailTransport();
  console.log(res.ok ? 'СОЕДИНЕНИЕ: ok' : `СОЕДИНЕНИЕ: отказ — ${res.error}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
