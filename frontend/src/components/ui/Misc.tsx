import type { ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from './icons';
import { Avatar as AdmiralAvatar, Tag, TextButton, type TagKind } from '@admiral-ds/react-ui';
import type { ExpenseCategory, User } from '../../types';
import { CATEGORIES } from '../../utils/categories';
import { formatMonthName, shiftMonth, toMonthKey } from '../../utils/date';
import { useUIStore } from '../../store/uiStore';
import { IconButton } from './Button';

export function Avatar({ user, size = 'md' }: { user: Pick<User, 'name' | 'color'>; size?: 'sm' | 'md' | 'lg' }) {
  const dimension = size === 'sm' ? 's' : size === 'lg' ? 'l' : 'm';
  return (
    <AdmiralAvatar
      userName={user.name}
      dimension={dimension}
      appearance={{ background: user.color, text: 'var(--admiral-color-Special_StaticWhite)' }}
      {...{ as: 'span' }}
      showTooltip={false}
      aria-hidden
    />
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
  const isCurrent = monthKey === toMonthKey();
  const [year, month] = monthKey.split('-');
  const firstYear = Math.min(1900, Number(year));
  const lastYear = Math.max(2100, Number(year));

  return (
    <div className="inline-flex h-12 select-none items-center gap-1 rounded-full bg-surface px-1">
      <IconButton label="Предыдущий месяц" onClick={() => setMonthKey(shiftMonth(monthKey, -1))}
        disabled={monthKey === '1900-01'} className="!size-10 !rounded-full shrink-0">
        <ChevronLeft size={20} />
      </IconButton>
      <div className="flex h-11 flex-col items-center justify-center">
        <div className="flex items-center gap-1">
          <PeriodSelect label="Месяц" value={month} onChange={(value) => setMonthKey(`${year}-${value}`)}>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index} value={String(index + 1).padStart(2, '0')}>{formatMonthName(index + 1)}</option>
            ))}
          </PeriodSelect>
          <PeriodSelect label="Год" value={year} onChange={(value) => setMonthKey(`${value}-${month}`)}>
            {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => (
              <option key={index} value={lastYear - index}>{lastYear - index}</option>
            ))}
          </PeriodSelect>
        </div>
        {!isCurrent && (
          <TextButton dimension="s" className="shrink-0" text="К текущему месяцу" onClick={() => setMonthKey(toMonthKey())} />
        )}
      </div>
      <IconButton label="Следующий месяц" onClick={() => setMonthKey(shiftMonth(monthKey, 1))}
        disabled={monthKey === '2100-12'} className="!size-10 !rounded-full shrink-0">
        <ChevronRight size={20} />
      </IconButton>
    </div>
  );
}

function PeriodSelect({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="relative inline-flex items-center">
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}
        className="cursor-pointer appearance-none rounded-md bg-surface py-1 pl-1 pr-4 text-sm font-semibold text-ink hover:bg-surface-muted">
        {children}
      </select>
      <ChevronDown size={12} aria-hidden className="pointer-events-none absolute right-0.5 text-ink-2" />
    </label>
  );
}

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const tagKinds: Record<BadgeTone, TagKind> = {
  neutral: 'neutral',
  accent: 'primary',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

export function Badge({ tone = 'neutral', icon, children }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <Tag as="span" dimension="s" kind={tagKinds[tone]} icon={icon} statusViaBackground isBorderHidden>
      {children}
    </Tag>
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
