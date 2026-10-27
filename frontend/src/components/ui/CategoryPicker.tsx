import type { ExpenseCategory } from '../../types';
import { ALL_CATEGORIES, CATEGORIES } from '../../utils/categories';

interface CategoryPickerProps {
  value: ExpenseCategory | null;
  onChange: (value: ExpenseCategory | null) => void;
  label?: string;
  /** One row of chips instead of large tiles — for an optional refinement step */
  compact?: boolean;
  /** Label of an extra first option that clears the choice; without it a category must be picked */
  noneLabel?: string;
}

/** Radio group of categories; selection is shown by border, fill and a check — not by hue alone */
export function CategoryPicker({ value, onChange, label = 'Категория', compact, noneLabel }: CategoryPickerProps) {
  const tile = (active: boolean) =>
    `${compact ? 'h-10 px-3.5 rounded-full flex-row gap-1.5 text-sm' : 'h-[4.25rem] rounded-[var(--radius-control)] flex-col gap-1 text-[13px]'}
     border flex items-center justify-center font-medium transition-colors
     ${active ? 'border-accent bg-accent-soft text-accent-ink ring-1 ring-accent' : 'border-line bg-surface-muted text-ink-2 hover:border-line-strong'}`;

  return (
    <fieldset>
      <legend className="block text-sm font-medium text-ink-2 mb-1.5">{label}</legend>
      <div role="radiogroup" className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-3 sm:grid-cols-5 gap-2'}>
        {noneLabel && (
          <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={tile(value === null)}>
            {noneLabel}
          </button>
        )}
        {ALL_CATEGORIES.map((key) => {
          const cfg = CATEGORIES[key];
          const Icon = cfg.icon;
          const active = value === key;
          return (
            <button key={key} type="button" role="radio" aria-checked={active} onClick={() => onChange(key)} className={tile(active)}>
              <Icon size={compact ? 16 : 20} style={{ color: active ? undefined : cfg.inkColor }} aria-hidden />
              {cfg.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
