import { useMemo } from 'react';
import type { MonthSummary } from '../../domain/budget';
import { CATEGORIES } from '../../utils/categories';
import { formatCurrency } from '../../utils/currency';

export function SpendingStructure({ summary, limit }: { summary: MonthSummary; limit: number }) {
  const total = summary.spent;

  const byCategory = useMemo(
    () => summary.categories.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent),
    [summary.categories]
  );

  const visible = byCategory.slice(0, limit);

  if (total === 0) {
    return <p className="text-ink-2 py-2">В этом месяце расходов пока нет.</p>;
  }

  return (
    <div>
      <ul>
        {visible.map((c) => (
          <li key={c.key} className="flex items-center gap-2.5 py-1.5 text-[15px]">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: CATEGORIES[c.key].color }} aria-hidden />
            <span className="flex-1 text-ink-2">{CATEGORIES[c.key].label}</span>
            <span className="tabular text-ink">{formatCurrency(c.spent)}</span>
            <span className="tabular text-ink-3 w-11 text-right">{Math.round((c.spent / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
