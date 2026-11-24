import { useId } from 'react';
import { RadioButton } from '@admiral-ds/react-ui';
import type { AccountMode } from '../../types';

const modes: { value: AccountMode; label: string }[] = [
  { value: 'shared_split', label: 'С общего счёта, поровну' },
  { value: 'shared_common', label: 'С общего счёта, без деления' },
  { value: 'personal_split', label: 'С личной карты, поровну' },
  { value: 'outside', label: 'Вне общего счёта и долей' },
];

export function AccountModeField<T extends AccountMode>({ value, options, onChange }: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="grid gap-2 rounded-control bg-surface-muted px-4 pb-4">
      <legend className="mb-3 font-medium text-ink">Источник и деление</legend>
      {options.map((option) => (
        <RadioButton key={option} name={name} value={option} checked={value === option} onChange={() => onChange(option)}>
          {modes.find((mode) => mode.value === option)?.label}
        </RadioButton>
      ))}
    </fieldset>
  );
}
