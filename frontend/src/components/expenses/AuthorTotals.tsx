import { useMemo } from 'react';
import type { Expense } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { plural } from '../../utils/date';
import { resolveAuthorName, useFamilyStore } from '../../store/familyStore';
import { Avatar } from '../ui/Misc';

/** Who entered the shown operations: count and sum per author */
export function AuthorTotals({ expenses }: { expenses: Expense[] }) {
  const family = useFamilyStore((s) => s.family);

  const byAuthor = useMemo(() => {
    const map = new Map<string, { name: string; color: string; amount: number; count: number }>();
    for (const e of expenses) {
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
  }, [expenses, family]);

  if (byAuthor.length === 0) return null;

  return (
    <div className="mt-5 pt-5 border-t border-line">
      <h3 className="font-semibold text-ink">Кто вносил записи</h3>
      <p className="text-sm text-ink-3 mt-0.5 mb-3">Это автор записи в приложении, а не обязательно тот, кто платил.</p>
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
  );
}
