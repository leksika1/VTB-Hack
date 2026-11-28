import type { SplitMode, User } from '../../types';
import { Button } from './Button';
import { ChoiceChip } from './ChoiceChip';
import { Field, FieldError } from './Field';
import { equalSplitInputs, splitRemainingPercent, splitSharesFromInputs } from './split';

interface SplitFieldProps {
  members: User[];
  mode: SplitMode;
  onModeChange: (mode: SplitMode) => void;
  selectedMembers: string[];
  onSelectedMembersChange: (ids: string[]) => void;
  shares: Record<string, string>;
  onSharesChange: (shares: Record<string, string>) => void;
  error?: string | null;
  disabled?: boolean;
}

export function SplitField({
  members,
  mode,
  onModeChange,
  selectedMembers,
  onSelectedMembersChange,
  shares,
  onSharesChange,
  error,
  disabled,
}: SplitFieldProps) {
  const changeMode = (next: SplitMode) => {
    onModeChange(next);
    if (next === 'equal' && selectedMembers.length === 0) onSelectedMembersChange(members.map((member) => member.id));
    if (next === 'shares' && !splitSharesFromInputs(members, shares)) onSharesChange(equalSplitInputs(members));
  };
  const remaining = splitRemainingPercent(members, shares);

  return (
    <section className="space-y-3 rounded-control bg-surface-muted p-3 sm:p-4" aria-labelledby="split-field-title">
      <h3 id="split-field-title" className="font-medium text-ink">Деление</h3>
      <div className="flex flex-wrap gap-2">
        {([
          ['none', 'Без деления'],
          ['equal', 'Поровну'],
          ['shares', 'В долях'],
        ] as const).map(([value, label]) => (
          <ChoiceChip key={value} selected={mode === value} disabled={disabled} onClick={() => changeMode(value)}>
            {label}
          </ChoiceChip>
        ))}
      </div>

      {mode === 'equal' && (
        <div>
          <p className="mb-2 text-sm text-ink-2">Между кем делим</p>
          <div className="flex flex-wrap gap-2">
            {members.map((member) => {
              const selected = selectedMembers.includes(member.id);
              return (
                <ChoiceChip key={member.id} selected={selected}
                  disabled={disabled || (selected && selectedMembers.length === 1)}
                  onClick={() => onSelectedMembersChange(selected
                    ? selectedMembers.filter((id) => id !== member.id)
                    : [...selectedMembers, member.id])}>
                  {member.name}
                </ChoiceChip>
              );
            })}
          </div>
        </div>
      )}

      {mode === 'shares' && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {members.map((member) => (
              <Field key={member.id} label={`Доля: ${member.name}`} suffix="%" inputMode="decimal" maxLength={6}
                disabled={disabled} value={shares[member.id] ?? ''}
                onChange={(event) => onSharesChange({ ...shares, [member.id]: event.target.value })} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-sm ${remaining === 0 ? 'text-ink-2' : 'text-danger'}`} aria-live="polite">
              Осталось распределить {remaining}%
            </p>
            <Button type="button" size="sm" variant="ghost" disabled={disabled}
              onClick={() => onSharesChange(equalSplitInputs(members))}>Поровну</Button>
          </div>
        </div>
      )}
      {error && <FieldError>{error}</FieldError>}
    </section>
  );
}
