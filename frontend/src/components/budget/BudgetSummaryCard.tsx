import { formatCurrency } from '../../utils/currency';
import { ProgressBar } from '../ui/ProgressBar';
import { TrendingDown, TrendingUp, Wallet, AlertTriangle } from 'lucide-react';

interface BudgetSummaryCardProps {
  budget: number;
  spent: number;
}

export function BudgetSummaryCard({ budget, spent }: BudgetSummaryCardProps) {
  const remaining = budget - spent;
  const percentage = budget > 0 ? (spent / budget) * 100 : 0;
  const overBudget = remaining < 0;

  return (
    <div className="glass-card p-5 mb-4 animate-fade-in">
      {/* Balance headline */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-semibold mb-1">Остаток</p>
          <p className={`text-3xl font-extrabold tracking-tight ${overBudget ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-primary)]'}`}>
            {formatCurrency(remaining)}
          </p>
        </div>
        {overBudget && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-danger-dim)] text-[var(--color-danger)] text-xs font-semibold">
            <AlertTriangle size={13} />
            Превышен
          </div>
        )}
      </div>

      {/* Progress */}
      <ProgressBar value={percentage} overBudget={overBudget} />
      <p className="text-xs text-[var(--color-text-muted)] mt-2 text-right">
        {Math.round(percentage)}% использовано
      </p>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[var(--color-bg-input)] border border-[var(--color-border)]">
          <div className="w-8 h-8 rounded-lg bg-[rgba(184,255,51,0.1)] flex items-center justify-center">
            <Wallet size={15} className="text-[var(--color-lime)]" />
          </div>
          <div>
            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Бюджет</p>
            <p className="text-sm font-bold text-[var(--color-text-primary)]">{formatCurrency(budget)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[var(--color-bg-input)] border border-[var(--color-border)]">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${overBudget ? 'bg-[var(--color-danger-dim)]' : 'bg-[rgba(255,184,51,0.1)]'}`}>
            {overBudget
              ? <TrendingDown size={15} className="text-[var(--color-danger)]" />
              : <TrendingUp size={15} className="text-[var(--color-warning)]" />
            }
          </div>
          <div>
            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Потрачено</p>
            <p className="text-sm font-bold text-[var(--color-text-primary)]">{formatCurrency(spent)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
