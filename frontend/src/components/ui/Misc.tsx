import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from './icons';
import { Avatar as AdmiralAvatar, Tag, TextButton, T, type TagKind } from '@admiral-ds/react-ui';
import type { ExpenseCategory, User } from '../../types';
import { CATEGORIES } from '../../utils/categories';
import { formatMonthKey, shiftMonth, toMonthKey } from '../../utils/date';
import { useUIStore } from '../../store/uiStore';
import { useMonthChanged } from '../../hooks/useMonthChanged';
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
  const direction = useUIStore((s) => s.monthDirection);
  const isCurrent = monthKey === toMonthKey();
  const changed = useMonthChanged();

  return (
    <div className="inline-flex items-center gap-1 bg-surface rounded-full p-0.5">
      <IconButton label="Предыдущий месяц" onClick={() => setMonthKey(shiftMonth(monthKey, -1))} className="!w-10 !h-10">
        <ChevronLeft size={20} />
      </IconButton>
      <div className="min-w-34 text-center leading-tight overflow-hidden" aria-live="polite">
        {/* Name and the «back to current» link slide together as one unit; the link exists only off the current month */}
        <div key={monthKey} className={!changed ? '' : direction > 0 ? 'animate-label-next' : 'animate-label-prev'}>
          <T font="Subtitle/Subtitle 2" className="text-ink block">
            {formatMonthKey(monthKey)}
          </T>
          {!isCurrent && (
            <TextButton dimension="s" text="К текущему месяцу" onClick={() => setMonthKey(toMonthKey())} />
          )}
        </div>
      </div>
      <IconButton label="Следующий месяц" onClick={() => setMonthKey(shiftMonth(monthKey, 1))} className="!w-10 !h-10">
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
