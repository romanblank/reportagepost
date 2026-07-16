// Тарифы PRO. Цены — в минорных единицах (копейки), инвариант «деньги = integer».
// Предложение по РФ-рынку репортажной фотографии (аудит MyWed: FREE/PRO, годовой
// с экономией). Оператор меняет суммы ЗДЕСЬ — цифры не зашиты в UI/копирайт.
export const PRO_MONTHLY_MINOR = 69_000; // 690 ₽/мес
export const PRO_ANNUAL_MINOR = 590_000; // 5 900 ₽/год

// Производные для витрины (не хранить — считать): экономия годового vs 12×месяц.
export const PRO_ANNUAL_MONTHLY_EQUIV_MINOR = Math.round(PRO_ANNUAL_MINOR / 12); // ≈492 ₽/мес
export const PRO_ANNUAL_SAVING_PCT = Math.round((1 - PRO_ANNUAL_MINOR / (PRO_MONTHLY_MINOR * 12)) * 100);

export type PlanTier = 'FREE' | 'PRO';

// Ключи фич — i18n (инвариант: строки UI только в словаре). Порядок = порядок в
// таблице сравнения. FREE-колонка: включена ли фича в бесплатный тариф.
export interface PlanFeature {
  key: string; // i18n-ключ в ru.pro.features
  free: boolean; // входит ли в FREE
}

export const PLAN_FEATURES: PlanFeature[] = [
  { key: 'page', free: true }, // публичная страница + профиль в каталоге
  { key: 'inquiries', free: true }, // приём заявок от заказчиков
  { key: 'portfolioBasic', free: true }, // портфолио (базовый лимит)
  { key: 'priority', free: false }, // приоритет в каталоге и поиске
  { key: 'portfolioUnlimited', free: false }, // портфолио без ограничений + фотоистории
  { key: 'recognition', free: false }, // бейдж PRO и участие в «Признании»
  { key: 'richProfile', free: false }, // пакеты цен, FAQ, оборудование, команда
  { key: 'analytics', free: false }, // статистика просмотров и сохранений
  { key: 'fastReview', free: false }, // приоритетное рассмотрение
];
