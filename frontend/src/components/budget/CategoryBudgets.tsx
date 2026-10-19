import type { ExpenseCategory } from '../../types';
import { CATEGORIES, ALL_CATEGORIES } from '../../utils/categories';
import { formatCurrency } from '../../utils/currency';
import { ProgressBar } from '../ui/ProgressBar';

interface CategoryBudgetsProps {
  plans: Record<ExpenseCategory, number>;
  spent: Record<ExpenseCategory, number>;
}

export function CategoryBudgets({ plans, spent }: CategoryBudgetsProps) {
  return (
    <div className="space-y-2.5 stagger-children">
      {ALL_CATEGORIES.map((key) => {
        const cfg = CATEGORIES[key];
        const plan = plans[key] || 0;
        const fact = spent[key] || 0;
        const pct = plan > 0 ? (fact / plan) * 100 : (fact > 0 ? 100 : 0);
        const over = fact > plan && plan > 0;
        const Icon = cfg.icon;

        return (
          <div key={key} className="glass-card p-4 flex items-center gap-3.5 transition-colors">
            {/* Icon */}
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.bgClass}`}
            >
              <Icon size={18} style={{ color: cfg.color }} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">{cfg.label}</span>
                <span className={`text-xs font-bold ${over ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-secondary)]'}`}>
                  {formatCurrency(fact)} <span className="text-[var(--color-text-muted)] font-normal">/ {formatCurrency(plan)}</span>
                </span>
              </div>
              <ProgressBar value={pct} color={cfg.color} overBudget={over} height="h-1.5" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
