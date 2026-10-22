const MONTHS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];
const MONTHS_PREPOSITIONAL = [
  "январе",
  "феврале",
  "марте",
  "апреле",
  "мае",
  "июне",
  "июле",
  "августе",
  "сентябре",
  "октябре",
  "ноябре",
  "декабре",
];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Returns 'YYYY-MM' for a Date */
export function toMonthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

/** 'YYYY-MM' → 'Октябрь 2026' */
export function formatMonthKey(key: string): string {
  return capitalize(formatMonthLower(key));
}

/** 'YYYY-MM' → 'октябрь 2026' (for «Бюджет на октябрь 2026») */
export function formatMonthLower(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/** 'YYYY-MM' → 'в октябре 2026' */
export function formatMonthIn(key: string): string {
  const [y, m] = key.split("-");
  const sameYear = Number(y) === new Date().getFullYear();
  return `в ${MONTHS_PREPOSITIONAL[Number(m) - 1]}${sameYear ? "" : ` ${y}`}`;
}

/** 'YYYY-MM-DD' → '18 октября' */
export function formatDateShort(iso: string): string {
  return parseISODate(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

/** 'YYYY-MM-DD' → 'Сегодня' / 'Вчера' / '18 октября, суббота' */
export function formatDayHeading(iso: string): string {
  const today = todayISO();
  if (iso === today) return "Сегодня";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === toISODate(yesterday)) return "Вчера";
  const d = parseISODate(iso);
  const weekday = d.toLocaleDateString("ru-RU", { weekday: "long" });
  return `${formatDateShort(iso)}, ${weekday}`;
}

/** Get today's date as YYYY-MM-DD */
export function todayISO(): string {
  return toISODate(new Date());
}

/** Navigate months: -1 or +1 */
export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  return toMonthKey(new Date(y, m - 1 + delta, 1));
}

/** Move a date to another month keeping the day (clamped to month length) */
export function moveDateToMonth(iso: string, monthKey: string): string {
  const day = Number(iso.slice(8, 10));
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${monthKey}-${pad(Math.min(day, lastDay))}`;
}

/** Whole days from today to the date (negative when in the past) */
export function daysFromToday(iso: string): number {
  const today = parseISODate(todayISO()).getTime();
  return Math.round((parseISODate(iso).getTime() - today) / 86_400_000);
}

/** «через 3 дня» / «сегодня» / «просрочен на 2 дня» */
export function formatDueIn(iso: string): string {
  const days = daysFromToday(iso);
  if (days === 0) return "Сегодня";
  if (days === 1) return "Завтра";
  if (days > 1) return `Через ${days} ${plural(days, "день", "дня", "дней")}`;
  const overdue = Math.abs(days);
  return `Просрочен на ${overdue} ${plural(overdue, "день", "дня", "дней")}`;
}

export function plural(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
