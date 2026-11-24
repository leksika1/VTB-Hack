import { Chips, type ChipsProps } from '@admiral-ds/react-ui';

type ChoiceChipProps = Pick<ChipsProps, 'children' | 'dimension' | 'disabled' | 'iconStart' | 'onClick'> & {
  selected: boolean;
};

export function ChoiceChip({ selected, disabled, onClick, ...props }: ChoiceChipProps) {
  return (
    <Chips
      {...props}
      role="button"
      aria-pressed={selected}
      aria-disabled={disabled}
      appearance="filled"
      selected={selected}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(event) => {
        if (event.key === ' ') event.preventDefault();
      }}
    />
  );
}
