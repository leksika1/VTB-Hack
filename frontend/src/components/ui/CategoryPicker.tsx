import type { ExpenseCategory } from '../../types';
import { ALL_CATEGORIES, CATEGORIES } from '../../utils/categories';

interface CategoryPickerProps {
  value: ExpenseCategory | null;
  onChange: (value: ExpenseCategory) => void;
  label?: string;
}

/** Radio group of categories; selection is shown by border, fill and a check — not by hue alone */
export function CategoryPicker({ value, onChange, label = 'Категория' }: CategoryPickerProps) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-ink-2 mb-1.5">{label}</legend>
      <div role="radiogroup" className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {ALL_CATEGORIES.map((key) => {
          const cfg = CATEGORIES[key];
          const Icon = cfg.icon;
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(key)}
              className={`h-[4.25rem] rounded-[var(--radius-control)] border flex flex-col items-center justify-center gap-1 text-[13px] font-medium transition-colors
                ${active ? 'border-accent bg-accent-soft text-accent-ink ring-1 ring-accent' : 'border-line bg-surface-muted text-ink-2 hover:border-line-strong'}`}
            >
              <Icon size={20} style={{ color: active ? undefined : cfg.inkColor }} aria-hidden />
              {cfg.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
