import { useState, type FormEvent } from 'react';
import { contributeToGoal } from '../../api/client';
import { useAsyncAction, useRequestId } from '../../hooks/useAsyncAction';
import { useDataStore } from '../../store/dataStore';
import { useFamilyStore, useIsParent } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { formatCurrency, parseAmount, validateAmount } from '../../utils/currency';
import { Modal } from '../ui/Modal';
import { AmountField, FormError } from '../ui/Field';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';

/** Put money aside into a goal. Any member can; a child contributes from pocket money */
export function GoalContributionModal({ goalId }: { goalId: string }) {
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);
  const goal = useDataStore((s) => s.goals.find((g) => g.id === goalId));
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const allowance = useDataStore((s) => s.allowances.find((a) => a.memberId === currentUserId));
  const isParent = useIsParent();
  const requestId = useRequestId();
  const contribute = useAsyncAction(contributeToGoal);

  const [amount, setAmount] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!goal) {
    return (
      <Modal title="Цель не найдена" onClose={closeModal}>
        <p className="text-ink-2">Возможно, её уже удалили.</p>
      </Modal>
    );
  }

  const amountError = submitted ? validateAmount(amount) : contribute.errorField === 'amount' ? contribute.error : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const value = parseAmount(amount);
    if (validateAmount(amount) || value === null) return;
    const res = await contribute.run(goal.id, value, requestId);
    if (!res.ok) return;
    closeModal();
    addToast(res.value.status === 'achieved' ? `Цель «${goal.title}» накоплена!` : `В «${goal.title}» отложено ${formatCurrency(value)}`);
  };

  return (
    <Modal
      title={`Отложить: ${goal.title}`}
      description={
        isParent
          ? 'Взнос не считается расходом и не уменьшает свободную сумму месяца — это отдельные отложенные деньги.'
          : 'Взнос списывается из ваших карманных денег.'
      }
      onClose={closeModal}
      footer={
        <Button type="submit" form="goal-contribution-form" fullWidth size="lg" loading={contribute.pending}>
          Отложить
        </Button>
      }
    >
      <div className="mb-5">
        <div className="flex items-baseline justify-between gap-3 mb-2 text-[15px]">
          <span className="text-ink-2">Накоплено</span>
          <span className="tabular text-ink">
            <span className="font-semibold">{formatCurrency(goal.saved)}</span> из {formatCurrency(goal.target)}
          </span>
        </div>
        <ProgressBar value={goal.saved} max={goal.target} label={`Накоплено ${goal.percent}%`} />
        {goal.left > 0 && <p className="text-sm text-ink-2 mt-2">Осталось {formatCurrency(goal.left)}</p>}
      </div>
      <form id="goal-contribution-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <AmountField
          label="Сколько отложить"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          emphasis
          error={amountError}
          hint={!isParent && allowance ? `Карманных денег осталось ${formatCurrency(allowance.left)}` : undefined}
          data-autofocus
        />
        {contribute.error && contribute.errorField !== 'amount' && <FormError>{contribute.error}</FormError>}
      </form>
    </Modal>
  );
}
