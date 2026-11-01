import { PiggyBank, Plus } from 'lucide-react';
import type { Goal } from '../../types';
import { useDataStore } from '../../store/dataStore';
import { useIsParent } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { formatCurrency } from '../../utils/currency';
import { formatDateShort, formatMonthIn } from '../../utils/date';
import { Card, SectionHeader } from '../ui/Card';
import { Badge } from '../ui/Misc';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/Feedback';
import { ProgressBar } from '../ui/ProgressBar';

/**
 * Family savings goals. Adults create and change them, anyone contributes.
 * Contributions are money put aside, not spending, so they never touch the month's free amount.
 */
export function GoalsCard() {
  const isParent = useIsParent();
  const openModal = useUIStore((s) => s.openModal);
  const goals = useDataStore((s) => s.goals);
  const shown = goals.filter((g) => g.status !== 'archived');
  const archived = goals.length - shown.length;

  // A child cannot create goals: an empty card would only be noise
  if (!isParent && shown.length === 0) return null;

  return (
    <Card className="p-5">
      <SectionHeader
        title="Цели"
        subtitle="Копим вместе. Отложенное не уменьшает бюджет месяца"
        action={
          isParent && (
            <Button size="sm" variant="secondary" icon={<Plus size={16} />} onClick={() => openModal({ type: 'goalForm' })}>
              Новая цель
            </Button>
          )
        }
      />
      {shown.length > 0 ? (
        <ul className="divide-y divide-line">
          {shown.map((g) => (
            <GoalRow key={g.id} goal={g} editable={isParent} />
          ))}
        </ul>
      ) : (
        <EmptyState
          compact
          icon={<PiggyBank size={22} />}
          title="Целей пока нет"
          description="Отпуск, ремонт, велосипед — откладывайте всей семьёй и смотрите, успеваете ли к сроку"
        />
      )}
      {archived > 0 && <p className="text-[13px] text-ink-3 mt-3">В архиве: {archived}</p>}
    </Card>
  );
}

function GoalRow({ goal, editable }: { goal: Goal; editable: boolean }) {
  const openModal = useUIStore((s) => s.openModal);
  const achieved = goal.status === 'achieved';
  const pace = achieved
    ? null
    : goal.monthlyNeeded !== null
      ? `Чтобы успеть, откладывайте ${formatCurrency(goal.monthlyNeeded)} в месяц`
      : goal.etaMonth
        ? `В таком темпе накопите ${formatMonthIn(goal.etaMonth)}`
        : null;

  return (
    <li className="py-3.5 first:pt-1 last:pb-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {editable ? (
            <button
              type="button"
              onClick={() => openModal({ type: 'goalForm', goalId: goal.id })}
              className="font-medium text-ink text-left break-words hover:underline rounded"
              title="Изменить цель"
            >
              {goal.title}
            </button>
          ) : (
            <p className="font-medium text-ink break-words">{goal.title}</p>
          )}
          <p className="text-sm text-ink-2 tabular">
            {formatCurrency(goal.saved)} из {formatCurrency(goal.target)}
            {goal.deadline && ` · к ${formatDateShort(goal.deadline)}`}
          </p>
        </div>
        {achieved ? (
          <Badge tone="success">Накоплено</Badge>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => openModal({ type: 'goalContribution', goalId: goal.id })}>
            Отложить
          </Button>
        )}
      </div>
      <div className="mt-2.5">
        <ProgressBar size="sm" value={goal.saved} max={goal.target} label={`${goal.title}: накоплено ${goal.percent}%`} />
      </div>
      {pace && <p className="text-[13px] text-ink-2 mt-1.5">{pace}</p>}
    </li>
  );
}
