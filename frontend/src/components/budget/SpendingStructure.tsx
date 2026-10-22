import { useMemo } from 'react';
import type { MonthSummary } from '../../domain/budget';
import { CATEGORIES } from '../../utils/categories';
import { formatCurrency } from '../../utils/currency';
import { plural } from '../../utils/date';
import { resolveAuthorName, useFamilyStore } from '../../store/familyStore';
import { Avatar } from '../ui/Misc';

/** Past spending structure. Secondary information, so it lives in «План», not on the overview. */
export function SpendingStructure({ summary }: { summary: MonthSummary }) {
  const family = useFamilyStore((s) => s.family);
  const total = summary.spent;

  const byCategory = useMemo(
    () => summary.categories.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent),
    [summary.categories]
  );

  const byAuthor = useMemo(() => {
    const map = new Map<string, { name: string; color: string; amount: number; count: number }>();
    for (const e of summary.expenses) {
      const key = e.authorId ?? 'unknown';
      const member = family?.members.find((m) => m.id === e.authorId);
      const entry = map.get(key) ?? {
        name: resolveAuthorName(family, e.authorId, e.authorName),
        color: member?.color ?? '#8792a2',
        amount: 0,
        count: 0,
      };
      entry.amount += e.amount;
      entry.count += 1;
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [summary.expenses, family]);

  if (total === 0) {
    return <p className="text-ink-2 py-2">В этом месяце расходов пока нет.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex h-4 rounded-full overflow-hidden gap-0.5" role="img" aria-label="Доли категорий в расходах месяца">
          {byCategory.map((c) => (
            <div key={c.key} style={{ width: `${(c.spent / total) * 100}%`, background: CATEGORIES[c.key].color }} />
          ))}
        </div>
        <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
          {byCategory.map((c) => (
            <li key={c.key} className="flex items-center gap-2.5 text-[15px]">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: CATEGORIES[c.key].color }} aria-hidden />
              <span className="flex-1 text-ink">{CATEGORIES[c.key].label}</span>
              <span className="tabular text-ink">{formatCurrency(c.spent)}</span>
              <span className="tabular text-ink-3 w-11 text-right">{Math.round((c.spent / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>

      {byAuthor.length > 0 && (
        <div className="pt-5 border-t border-line">
          <h3 className="font-semibold text-ink">Кто вносил записи</h3>
          <p className="text-sm text-ink-3 mt-0.5 mb-3">
            Это автор записи в приложении, а не обязательно тот, кто платил.
          </p>
          <ul className="space-y-2.5">
            {byAuthor.map((a) => (
              <li key={a.name} className="flex items-center gap-3">
                <Avatar user={a} size="sm" />
                <span className="flex-1 min-w-0 truncate text-ink">{a.name}</span>
                <span className="text-sm text-ink-3 whitespace-nowrap">
                  {a.count} {plural(a.count, 'запись', 'записи', 'записей')}
                </span>
                <span className="tabular text-ink w-28 text-right">{formatCurrency(a.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
