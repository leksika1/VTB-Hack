const wholeFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const kopecksFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 12 500 ₽, or 12 500,50 ₽ when there are kopecks */
export function formatCurrency(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? wholeFormatter.format(rounded) : kopecksFormatter.format(rounded);
}

/** Same as formatCurrency but always with an explicit sign for deltas: +2 000 ₽ / −2 000 ₽ */
export function formatSigned(amount: number): string {
  if (amount === 0) return formatCurrency(0);
  return `${amount > 0 ? '+' : '−'}${formatCurrency(Math.abs(amount))}`;
}

/** Negative values with a typographic minus */
export function formatBalance(amount: number): string {
  return amount < 0 ? `−${formatCurrency(Math.abs(amount))}` : formatCurrency(amount);
}

export const MAX_AMOUNT = 100_000_000;

/**
 * Parse user input like "1 234,50" or "1234.5".
 * Returns null when the value is not a valid number.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[\s ₽]/g, '').replace(',', '.');
  if (cleaned === '') return null;
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

/** Validation message for a money field, or null when valid */
export function validateAmount(raw: string, { allowZero = false } = {}): string | null {
  if (raw.trim() === '') return allowZero ? null : 'Укажите сумму';
  const value = parseAmount(raw);
  if (value === null) return 'Введите число, например 1 500 или 1 500,50';
  if (value < 0) return 'Сумма не может быть отрицательной';
  if (value === 0 && !allowZero) return 'Сумма должна быть больше нуля';
  if (value > MAX_AMOUNT) return 'Слишком большая сумма';
  return null;
}

/** Format a number for an input field: 12500.5 → "12500,5" */
export function amountToInput(amount: number | undefined): string {
  if (!amount) return '';
  return String(amount).replace('.', ',');
}
