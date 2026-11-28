import { useId } from 'react';
import { RadioButton } from '@admiral-ds/react-ui';

export type PaymentSourceOption = 'shared_equal' | 'shared_common' | 'outside';

const options: { value: PaymentSourceOption; label: string }[] = [
  { value: 'shared_equal', label: 'С общего счёта, поровну' },
  { value: 'shared_common', label: 'С общего счёта, без деления' },
  { value: 'outside', label: 'Вне общего счёта и долей' },
];

export function PaymentSourceField({ value, onChange }: {
  value: PaymentSourceOption;
  onChange: (value: PaymentSourceOption) => void;
}) {
  const name = useId();
  return (
    <fieldset className="grid gap-2 rounded-control bg-surface-muted px-4 pb-4">
      <legend className="mb-3 font-medium text-ink">Источник и деление</legend>
      {options.map((option) => (
        <RadioButton key={option.value} name={name} value={option.value} checked={value === option.value}
          onChange={() => onChange(option.value)}>
          {option.label}
        </RadioButton>
      ))}
    </fieldset>
  );
}
