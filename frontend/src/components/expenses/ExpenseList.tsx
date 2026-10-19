import type { Expense } from '../../types';
import { ExpenseItem } from './ExpenseItem';
import { EmptyState } from '../ui/EmptyState';
import { ReceiptText } from 'lucide-react';

interface ExpenseListProps {
  expenses: Expense[];
  onAddClick: () => void;
}

export function ExpenseList({ expenses, onAddClick }: ExpenseListProps) {
  if (expenses.length === 0) {
    return (
      <EmptyState
        icon={<ReceiptText size={28} />}
        title="Расходов пока нет"
        description="Добавьте первую покупку, чтобы начать учёт"
        action={
          <button
            onClick={onAddClick}
            className="px-5 py-2.5 rounded-[var(--radius-button)] bg-[var(--color-lime)] text-[var(--color-text-inverse)]
              font-bold text-xs uppercase tracking-wide hover:brightness-110 active:scale-[0.97] transition-all"
          >
            Добавить расход
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-2 stagger-children">
      {expenses.map((e) => (
        <ExpenseItem key={e.id} expense={e} />
      ))}
    </div>
  );
}
