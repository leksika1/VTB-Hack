import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMonthKey, shiftMonth } from '../../utils/date';

interface MonthSelectorProps {
  monthKey: string;
  onChange: (mk: string) => void;
}

export function MonthSelector({ monthKey, onChange }: MonthSelectorProps) {
  return (
    <div className="flex items-center justify-center gap-4 mb-5 animate-fade-in">
      <button
        onClick={() => onChange(shiftMonth(monthKey, -1))}
        className="w-8 h-8 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)]
          flex items-center justify-center text-[var(--color-text-secondary)]
          hover:text-[var(--color-lime)] hover:border-[var(--color-border-focus)]
          transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-base font-bold text-[var(--color-text-primary)] min-w-[10rem] text-center">
        {formatMonthKey(monthKey)}
      </span>
      <button
        onClick={() => onChange(shiftMonth(monthKey, 1))}
        className="w-8 h-8 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)]
          flex items-center justify-center text-[var(--color-text-secondary)]
          hover:text-[var(--color-lime)] hover:border-[var(--color-border-focus)]
          transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
