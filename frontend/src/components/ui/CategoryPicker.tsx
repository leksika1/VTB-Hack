import { ChoiceChip } from './ChoiceChip';
import type { ExpenseCategory } from '../../types';
import { ALL_CATEGORIES, CATEGORIES } from '../../utils/categories';

export interface CategoryPickerProps {
  value: ExpenseCategory | null;
  onChange: (value: ExpenseCategory | null) => void;
  label?: string;
  /** Smaller chips for an optional refinement step */
  compact?: boolean;
  /** Label of an extra first option that clears the choice; without it a category must be picked */
  noneLabel?: string;
}

export function CategoryPicker({ value, onChange, label = 'Категория', compact, noneLabel }: CategoryPickerProps) {
  const dimension = compact ? 's' : 'm';
  return (
    <fieldset>
      {label && <legend className="mb-2 text-sm font-medium text-ink-2">{label}</legend>}
      <div className="flex flex-wrap gap-2">
        {noneLabel && (
          <ChoiceChip dimension={dimension}
            selected={value === null} onClick={() => onChange(null)}>
            {noneLabel}
          </ChoiceChip>
        )}
        {ALL_CATEGORIES.map((key) => {
          const { icon: Icon, label: name } = CATEGORIES[key];
          return (
            <ChoiceChip key={key} dimension={dimension}
              selected={value === key} iconStart={<Icon size={16} aria-hidden />} onClick={() => onChange(key)}>
              {name}
            </ChoiceChip>
          );
        })}
      </div>
    </fieldset>
  );
}
