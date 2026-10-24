import type { Expense, Family } from '../types';
import { resolveAuthorName } from '../store/familyStore';
import { CATEGORIES } from './categories';

/**
 * One CSV cell. A leading =, +, -, @ makes Excel run the text as a formula (CSV injection),
 * so such text is prefixed with an apostrophe; quotes are doubled.
 */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Excel with Russian locale: «;» between cells, comma as the decimal separator, BOM so it detects UTF-8 */
export function expensesToCsv(expenses: Expense[], family: Family | null): string {
  const header = ['Дата', 'Что купили', 'Категория', 'Сумма, ₽', 'Кто добавил', 'Кто платил'];
  const rows = expenses.map((e) => [
    e.date,
    cell(e.title),
    cell(CATEGORIES[e.category].label),
    e.amount.toFixed(2).replace('.', ','),
    cell(resolveAuthorName(family, e.authorId, e.authorName)),
    cell(resolveAuthorName(family, e.paidBy ?? e.authorId, e.authorName)),
  ]);
  return '﻿' + [header.map(cell), ...rows].map((r) => r.join(';')).join('\r\n');
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoking right away cancels the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
