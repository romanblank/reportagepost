// Встраивает JSON-LD микроразметку. Серверный компонент. Данные — из чистых
// билдеров (src/lib/structured-data.ts). Экранирование '<' в JSON защищает от
// раннего закрытия <script> (стандартная предосторожность для inline JSON-LD).
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
