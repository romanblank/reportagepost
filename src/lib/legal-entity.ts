// Реквизиты оператора (ИП) для юрдокументов и требований 152-ФЗ.
//
// ⚠️ ЕДИНСТВЕННЫЕ ПЛЕЙСХОЛДЕРЫ во всей юр-части. Это данные госреестра —
// выдумывать НЕЛЬЗЯ (фабрикация реквизитов). Оператор заполняет реальными:
// ФИО ИП, ИНН, ОГРНИП, юридический адрес. До заполнения на страницах видно
// «[указывается ИП: …]» — платформа под noindex/закрытой бетой, это допустимо
// до публичного запуска (S4).
//
// email/домен можно задать сразу — это контактный канал на своём домене,
// не реестровая запись.
export const LEGAL_ENTITY = {
  form: 'Индивидуальный предприниматель',
  name: '', // ФИО ИП, напр. «Иванов Иван Иванович»
  inn: '', // ИНН
  ogrnip: '', // ОГРНИП
  address: '', // юридический адрес (полный — только на legal-страницах, РФ-правило)
  email: 'support@reportagepost.com', // контакт для обращений субъектов ПДн
} as const;

// Значение реквизита или видимый плейсхолдер (не выдумываем реестровые данные).
export function entityField(value: string, ruFallbackLabel: string): string {
  return value.trim() ? value : `[указывается ИП: ${ruFallbackLabel}]`;
}

// Полное наименование оператора одной строкой для «шапки» документов.
export function operatorLine(): string {
  const name = entityField(LEGAL_ENTITY.name, 'ФИО');
  const inn = entityField(LEGAL_ENTITY.inn, 'ИНН');
  const ogrnip = entityField(LEGAL_ENTITY.ogrnip, 'ОГРНИП');
  return `${LEGAL_ENTITY.form} ${name}, ИНН ${inn}, ОГРНИП ${ogrnip}`;
}
