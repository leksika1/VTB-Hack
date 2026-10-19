import { useMemo } from 'react';
import type { ExpenseCategory, Expense, User } from '../../types';
import { CATEGORIES, ALL_CATEGORIES } from '../../utils/categories';
import { formatCurrency } from '../../utils/currency';
import { PieChart, Users, TrendingUp } from 'lucide-react';

interface SpendingChartProps {
  expenses: Expense[];
  members: User[];
  totalSpent: number;
}

export function SpendingChart({ expenses, members, totalSpent }: SpendingChartProps) {
  // Category stats
  const categoryStats = useMemo(() => {
    const map: Record<ExpenseCategory, number> = {
      food: 0,
      housing: 0,
      transport: 0,
      kids: 0,
      other: 0,
    };
    for (const exp of expenses) {
      map[exp.category] = (map[exp.category] || 0) + exp.amount;
    }
    return ALL_CATEGORIES.map((cat) => ({
      category: cat,
      label: CATEGORIES[cat].label,
      color: CATEGORIES[cat].color,
      amount: map[cat],
      percentage: totalSpent > 0 ? (map[cat] / totalSpent) * 100 : 0,
    })).filter((c) => c.amount > 0);
  }, [expenses, totalSpent]);

  // Member stats
  const memberStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const exp of expenses) {
      map[exp.authorId] = (map[exp.authorId] || 0) + exp.amount;
    }
    return members.map((m) => ({
      member: m,
      amount: map[m.id] || 0,
      percentage: totalSpent > 0 ? ((map[m.id] || 0) / totalSpent) * 100 : 0,
    }));
  }, [expenses, members, totalSpent]);

  if (totalSpent === 0) return null;

  // Compute SVG Donut segments
  let cumulativePercent = 0;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="glass-card p-5 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PieChart size={16} className="text-[var(--color-lime)]" />
          <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
            Структура расходов
          </h3>
        </div>
        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
          Всего: {formatCurrency(totalSpent)}
        </span>
      </div>

      {/* Donut chart + breakdown */}
      <div className="flex items-center gap-6">
        {/* SVG Donut */}
        <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="transparent"
              stroke="var(--color-border)"
              strokeWidth="11"
            />
            {categoryStats.map((item) => {
              const strokeDasharray = `${(item.percentage / 100) * circumference} ${circumference}`;
              const strokeDashoffset = -((cumulativePercent / 100) * circumference);
              cumulativePercent += item.percentage;
              return (
                <circle
                  key={item.category}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  stroke={item.color}
                  strokeWidth="11"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <TrendingUp size={16} className="text-[var(--color-lime)] mb-0.5" />
            <span className="text-[11px] font-bold text-[var(--color-text-primary)]">
              {categoryStats.length} кат.
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-1.5 min-w-0">
          {categoryStats.slice(0, 4).map((item) => (
            <div key={item.category} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[var(--color-text-secondary)] truncate">{item.label}</span>
              </div>
              <span className="font-semibold text-[var(--color-text-primary)] shrink-0 ml-2">
                {Math.round(item.percentage)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Member contributions */}
      {members.length > 1 && (
        <div className="pt-3 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Users size={13} className="text-[var(--color-text-muted)]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Вклад участников семьи
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {memberStats.map(({ member, amount, percentage }) => (
              <div
                key={member.id}
                className="p-2.5 rounded-xl bg-[var(--color-bg-input)] border border-[var(--color-border)] flex items-center gap-2.5"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ backgroundColor: member.color + '25', color: member.color }}
                >
                  {member.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
                    {member.name}
                  </p>
                  <p className="text-[10px] text-[var(--color-lime)] font-medium">
                    {formatCurrency(amount)} ({Math.round(percentage)}%)
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
