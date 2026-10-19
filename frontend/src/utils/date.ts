const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

/** Returns 'YYYY-MM' for a Date */
export function toMonthKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** 'YYYY-MM' → 'Октябрь 2026' */
export function formatMonthKey(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

/** 'YYYY-MM-DD' → '18 октября' */
export function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/** Get today's date as YYYY-MM-DD */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Navigate months: -1 or +1 */
export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return toMonthKey(d);
}
