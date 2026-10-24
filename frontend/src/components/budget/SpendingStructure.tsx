import { useMemo } from 'react';
import type { MonthSummary } from '../../domain/budget';
import { CATEGORIES } from '../../utils/categories';
import { formatCurrency } from '../../utils/currency';

/** Past spending structure. Secondary information, so it lives in «План», not on the overview. */
export function SpendingStructure({ summary }: { summary: MonthSummary }) {
  const total = summary.spent;

  const byCategory = useMemo(
    () => summary.categories.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent),
    [summary.categories]
  );

  if (total === 0) {
    return <p className="text-ink-2 py-2">В этом месяце расходов пока нет.</p>;
  }

  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden gap-0.5" role="img" aria-label="Доли категорий в расходах месяца">
        {byCategory.map((c) => (
          <div key={c.key} style={{ width: `${(c.spent / total) * 100}%`, background: CATEGORIES[c.key].color }} />
        ))}
      </div>
      <ul className="mt-4">
        {byCategory.map((c) => (
          <li key={c.key} className="flex items-center gap-2.5 py-1.5 text-[15px]">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: CATEGORIES[c.key].color }} aria-hidden />
            <span className="flex-1 text-ink-2">{CATEGORIES[c.key].label}</span>
            <span className="tabular text-ink">{formatCurrency(c.spent)}</span>
            <span className="tabular text-ink-3 w-11 text-right">{Math.round((c.spent / total) * 100)}%</span>
          </li>
        ))}
        <li className="flex items-center gap-2.5 py-1.5 mt-1 pt-2.5 border-t border-line text-[15px] font-semibold">
          <span className="flex-1 text-ink">Всего</span>
          <span className="tabular text-ink">{formatCurrency(total)}</span>
          <span className="w-11" aria-hidden />
        </li>
      </ul>
    </div>
  );
}
