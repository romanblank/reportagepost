/**
 * Заголовок раздела — единый способ набора (visual-identity §4.3).
 *
 * До этого разделы профиля озаглавливались вразнобой: часть — мелкой меткой
 * `.t-caption muted`, часть — утилитой размера прямо в разметке. В итоге страница
 * читалась как список блоков продукта, а не как разворот издания: у разделов
 * не было веса, а спека прямо запрещает зашитые размеры вместо типо-ролей.
 *
 * Здесь: рубрика набирается моноширинным (сигнатура бренда — язык контактного
 * листа), сам заголовок — антиквой. Тонкая линия сверху отбивает раздел, не
 * рисуя вокруг него коробку.
 */
export function SectionHeading({
  kicker,
  title,
  action,
  divider = true,
}: {
  kicker?: string;
  title: string;
  /** Ссылка/кнопка справа — например «показать все» */
  action?: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <div className={divider ? 'border-t border-line pt-6' : ''}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {kicker && (
            <p className="t-caption muted" style={{ fontFamily: 'var(--font-mono)' }}>{kicker}</p>
          )}
          <h2 className="t-h2 mt-1">{title}</h2>
        </div>
        {action && <div className="shrink-0 t-small">{action}</div>}
      </div>
    </div>
  );
}
