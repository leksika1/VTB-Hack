import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ExpenseCategory, User } from '../../types';
import { CATEGORIES } from '../../utils/categories';
import { formatMonthKey, shiftMonth, toMonthKey } from '../../utils/date';
import { useUIStore } from '../../store/uiStore';
import { IconButton } from './Button';

export function Avatar({ user, size = 'md' }: { user: Pick<User, 'name' | 'color'>; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-12 h-12 text-lg' : 'w-9 h-9 text-sm';
  return (
    <span
      className={`${dims} rounded-control inline-flex items-center justify-center font-semibold text-white shrink-0 ring-2 ring-[var(--line)]`}
      style={{ backgroundColor: user.color }}
      aria-hidden
    >
      {user.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

export function CategoryIcon({ category, size = 'md' }: { category: ExpenseCategory; size?: 'sm' | 'md' }) {
  const cfg = CATEGORIES[category];
  const Icon = cfg.icon;
  const dims = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
  return (
    <span
      className={`${dims} rounded-full inline-flex items-center justify-center shrink-0`}
      style={{ backgroundColor: cfg.softColor, color: cfg.inkColor }}
      aria-hidden
    >
      <Icon size={size === 'sm' ? 16 : 18} />
    </span>
  );
}

/** Switches the viewed month for all sections */
export function MonthSwitcher() {
  const monthKey = useUIStore((s) => s.monthKey);
  const setMonthKey = useUIStore((s) => s.setMonthKey);
  const direction = useUIStore((s) => s.monthDirection);
  const isCurrent = monthKey === toMonthKey();

  return (
    <div className="inline-flex items-center gap-1 bg-surface rounded-full shadow-card p-0.5">
      <IconButton label="Предыдущий месяц" onClick={() => setMonthKey(shiftMonth(monthKey, -1))} className="w-10 h-10">
        <ChevronLeft size={20} />
      </IconButton>
      <div className="min-w-34 text-center leading-tight overflow-hidden" aria-live="polite">
        {/* Name and the «back to current» link slide together as one unit; the link exists only off the current month */}
        <div key={monthKey} className={direction > 0 ? 'animate-label-next' : 'animate-label-prev'}>
          <div className="text-[15px] font-semibold text-ink">{formatMonthKey(monthKey)}</div>
          {!isCurrent && (
            <button type="button" onClick={() => setMonthKey(toMonthKey())} className="text-xs font-medium text-accent-ink hover:underline">
              К текущему месяцу
            </button>
          )}
        </div>
      </div>
      <IconButton label="Следующий месяц" onClick={() => setMonthKey(shiftMonth(monthKey, 1))} className="w-10 h-10">
        <ChevronRight size={20} />
      </IconButton>
    </div>
  );
}

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const BADGE: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-2',
  accent: 'bg-accent-soft text-accent-ink',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({ tone = 'neutral', icon, children }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-control text-[13px] font-semibold whitespace-nowrap ${BADGE[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

/** Label–value row used for calculations */
export function AmountRow({ label, value, strong, tone, hint }: { label: ReactNode; value: string; strong?: boolean; tone?: 'danger' | 'muted'; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <span className={strong ? 'font-semibold text-ink' : 'text-ink-2'}>{label}</span>
        {hint && <div className="text-[13px] text-ink-3">{hint}</div>}
      </div>
      <span className={`tabular whitespace-nowrap ${strong ? 'font-semibold' : ''} ${tone === 'danger' ? 'text-danger' : tone === 'muted' ? 'text-ink-2' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  );
}
