import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from './icons';
import { Avatar as AdmiralAvatar, Option, Select, Tag, TextButton, type TagKind } from '@admiral-ds/react-ui';
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
  const currentMonthKey = toMonthKey();
  const isCurrent = monthKey === currentMonthKey;
  const [year, month] = monthKey.split('-');
  const firstYear = Math.min(1900, Number(year));
  const currentYear = Number(currentMonthKey.slice(0, 4));

  return (
    <div className="inline-flex h-14 select-none items-center rounded-full bg-surface px-1">
      <IconButton label="Предыдущий месяц" onClick={() => setMonthKey(shiftMonth(monthKey, -1))}
        disabled={monthKey === `${firstYear}-01`} className="!size-8 sm:!size-10 !rounded-full shrink-0">
        <ChevronLeft size={20} />
      </IconButton>
      <div className="flex flex-col items-center justify-center">
        <div className="flex items-center gap-1">
          <Select aria-label="Месяц" dimension="s" className="w-30" value={month}
            onChange={(event) => setMonthKey(`${year}-${event.target.value}`)}>
            {Array.from({ length: 12 }, (_, index) => {
              const value = String(index + 1).padStart(2, '0');
              return <Option key={value} value={value}>{formatMonthName(index + 1)}</Option>;
            })}
          </Select>
          <Select aria-label="Год" dimension="s" className="w-21" value={year}
            onChange={(event) => setMonthKey(`${event.target.value}-${month}`)}>
            {Array.from({ length: currentYear - firstYear + 1 }, (_, index) => {
              const value = String(currentYear - index);
              return <Option key={value} value={value}>{value}</Option>;
            })}
          </Select>
        </div>
        {!isCurrent && (
          <TextButton dimension="s" className="shrink-0" text="К текущему месяцу" onClick={() => setMonthKey(currentMonthKey)} />
        )}
      </div>
      <IconButton label="Следующий месяц" onClick={() => setMonthKey(shiftMonth(monthKey, 1))}
        disabled={monthKey >= `${currentYear}-12`} className="!size-8 sm:!size-10 !rounded-full shrink-0">
        <ChevronRight size={20} />
      </IconButton>
    </div>
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
