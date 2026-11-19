import { Chips } from '@admiral-ds/react-ui';
import type { ExpenseCategory } from '../../types';
import { ALL_CATEGORIES, CATEGORIES } from '../../utils/categories';

export interface CategoryPickerProps {
  value: ExpenseCategory | null;
  onChange: (value: ExpenseCategory | null) => void;
  label?: string;
  /** One row of chips instead of large tiles — for an optional refinement step */
  compact?: boolean;
  /** Label of an extra first option that clears the choice; without it a category must be picked */
  noneLabel?: string;
}

/** Radio group of categories using Admiral DS design patterns */
export function CategoryPicker({ value, onChange, label = 'Категория', compact, noneLabel }: CategoryPickerProps) {
  if (compact) {
    return (
      <fieldset>
        {label && <legend className="block text-sm font-medium text-ink-2 mb-1.5">{label}</legend>}
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {noneLabel && (
            <Chips
              dimension="m"
              appearance={value === null ? 'filled' : 'outlined'}
              selected={value === null}
              onClick={() => onChange(null)}
              className="cursor-pointer select-none"
            >
              {noneLabel}
            </Chips>
          )}
          {ALL_CATEGORIES.map((key) => {
            const cfg = CATEGORIES[key];
            const Icon = cfg.icon;
            const active = value === key;
            return (
              <Chips
                key={key}
                dimension="m"
                appearance={active ? 'filled' : 'outlined'}
                selected={active}
                iconStart={<Icon size={16} style={{ color: active ? undefined : cfg.inkColor }} aria-hidden />}
                onClick={() => onChange(key)}
                className="cursor-pointer select-none"
              >
                {cfg.label}
              </Chips>
            );
          })}
        </div>
      </fieldset>
    );
  }

  const tile = (active: boolean) =>
    `h-[4.25rem] rounded-[var(--radius-control)] flex flex-col items-center justify-center gap-1 text-[13px]
     border font-medium transition-all select-none cursor-pointer
     ${active
       ? 'border-accent bg-accent-soft text-accent-ink ring-2 ring-accent shadow-sm'
       : 'border-line bg-surface-muted text-ink-2 hover:border-line-strong hover:bg-surface'}`;

  return (
    <fieldset>
      <legend className="block text-sm font-medium text-ink-2 mb-1.5">{label}</legend>
      <div role="radiogroup" className="grid grid-cols-3 sm:grid-cols-5 gap-2">
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
              <Icon size={20} style={{ color: active ? undefined : cfg.inkColor }} aria-hidden />
              <span>{cfg.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
