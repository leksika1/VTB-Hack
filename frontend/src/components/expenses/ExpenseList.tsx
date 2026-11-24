import { T } from '@admiral-ds/react-ui';
import { useMemo } from 'react';
import { Calendar, ChevronRight } from '../ui/icons';
import type { Expense } from '../../types';
import { CATEGORIES } from '../../utils/categories';
import { formatCurrency } from '../../utils/currency';
import { formatDateShort, formatDayHeading } from '../../utils/date';
import { resolveAuthorName, useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { CategoryIcon } from '../ui/Misc';

/** Compact operation row; details and actions open on tap */
export function ExpenseRow({ expense, showDate }: { expense: Expense; showDate?: boolean }) {
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const openModal = useUIStore((s) => s.openModal);
  const cfg = CATEGORIES[expense.category];
  const author = expense.authorId === currentUserId ? 'Вы' : resolveAuthorName(family, expense.authorId, expense.authorName);

  return (
    <li>
      <T
        as="button"
        font="Body/Body 1 Short"
        type="button"
        onClick={() => openModal({ type: 'expenseDetails', expenseId: expense.id })}
        className="w-[calc(100%+1rem)] flex items-center gap-3 py-3 px-2 -mx-2 rounded-xl text-left hover:bg-surface-muted transition-colors"
      >
        <CategoryIcon category={expense.category} />
        <span className="flex-1 min-w-0">
          <span className="block font-medium text-ink truncate" title={expense.title}>
            {expense.title}
          </span>
          <span className="block truncate text-sm text-ink-2">
            {cfg.label}, {author}
            {showDate && `, ${formatDateShort(expense.date)}`}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-ink tabular whitespace-nowrap">
          {expense.paymentId && <Calendar size={14} className="text-ink-3" aria-label="Обязательный платёж" />}
          −{formatCurrency(expense.amount)}
        </span>
        <ChevronRight size={18} className="text-ink-3 shrink-0 hidden sm:block" aria-hidden />
      </T>
    </li>
  );
}

/** Flat list (for short «последние операции») */
export function ExpenseList({ expenses, showDate }: { expenses: Expense[]; showDate?: boolean }) {
  return (
    <ul className="space-y-1">
      {expenses.map((e) => (
        <ExpenseRow key={e.id} expense={e} showDate={showDate} />
      ))}
    </ul>
  );
}

/** History grouped by day, newest first. Expects sorted input. */
export function ExpenseDayGroups({ expenses }: { expenses: Expense[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of expenses) {
      const list = map.get(e.date);
      if (list) list.push(e);
      else map.set(e.date, [e]);
    }
    return Array.from(map.entries());
  }, [expenses]);

  return (
    <div className="space-y-5">
      {groups.map(([date, items]) => (
        <section key={date} aria-label={formatDayHeading(date)}>
          <div className="flex items-baseline justify-between gap-3 mb-1 rounded-lg bg-surface-muted px-3 py-2">
            <h3 className="text-sm font-semibold text-ink-2">{formatDayHeading(date)}</h3>
            <span className="text-sm text-ink-3 tabular">−{formatCurrency(items.reduce((s, e) => s + e.amount, 0))}</span>
          </div>
          <ExpenseList expenses={items} />
        </section>
      ))}
    </div>
  );
}
