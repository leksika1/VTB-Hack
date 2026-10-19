import type { Expense } from '../../types';
import { CATEGORIES } from '../../utils/categories';
import { formatCurrency } from '../../utils/currency';
import { formatDateShort } from '../../utils/date';
import { Pencil, Trash2 } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useFamilyStore } from '../../store/familyStore';

interface ExpenseItemProps {
  expense: Expense;
}

export function ExpenseItem({ expense }: ExpenseItemProps) {
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const family = useFamilyStore((s) => s.family);
  const setEditingExpense = useUIStore((s) => s.setEditingExpense);
  const setDeletingExpense = useUIStore((s) => s.setDeletingExpense);

  const cfg = CATEGORIES[expense.category];
  const Icon = cfg.icon;
  const isOwn = expense.authorId === currentUserId;
  const author = family?.members.find((m) => m.id === expense.authorId);

  return (
    <div className="glass-card p-3.5 sm:p-4 flex items-center gap-3 group transition-all hover:border-[rgba(184,255,51,0.2)]">
      {/* Category icon */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.bgClass}`}>
        <Icon size={18} style={{ color: cfg.color }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
            {expense.title}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <span>{formatDateShort(expense.date)}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            {author && (
              <span
                className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[9px] font-bold"
                style={{ backgroundColor: author.color + '33', color: author.color }}
              >
                {author.name[0]}
              </span>
            )}
            <span className="truncate">{expense.authorName}</span>
          </span>
        </div>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-[var(--color-text-primary)]">
          −{formatCurrency(expense.amount)}
        </p>
        <span
          className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
          style={{ backgroundColor: cfg.color + '15', color: cfg.color }}
        >
          {cfg.label}
        </span>
      </div>

      {/* Actions (own only, touch accessible) */}
      {isOwn ? (
        <div className="flex items-center gap-1 shrink-0 ml-1">
          <button
            onClick={() => setEditingExpense(expense.id)}
            className="w-7 h-7 rounded-lg bg-[var(--color-bg-input)] flex items-center justify-center
              text-[var(--color-text-secondary)] hover:text-[var(--color-lime)] hover:bg-[rgba(184,255,51,0.1)]
              transition-colors"
            title="Редактировать"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={() => setDeletingExpense(expense.id)}
            className="w-7 h-7 rounded-lg bg-[var(--color-bg-input)] flex items-center justify-center
              text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]
              transition-colors"
            title="Удалить"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ) : (
        <div className="w-1.5" />
      )}
    </div>
  );
}
