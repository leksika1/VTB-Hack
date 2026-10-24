import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteAllowance, saveAllowance } from '../../api/client';
import { useAsyncAction, useRequestId } from '../../hooks/useAsyncAction';
import { useDataStore } from '../../store/dataStore';
import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { amountToInput, formatCurrency, parseAmount, validateAmount } from '../../utils/currency';
import { Modal } from '../ui/Modal';
import { AmountField, FormError } from '../ui/Field';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';

type Period = 'week' | 'month';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'На неделю' },
  { value: 'month', label: 'На месяц' },
];

/** An adult sets a child's spending limit; the server counts what is spent and what is left */
export function AllowanceFormModal({ memberId }: { memberId: string }) {
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);
  const child = useFamilyStore((s) => s.family?.members.find((m) => m.id === memberId));
  const existing = useDataStore((s) => s.allowances.find((a) => a.memberId === memberId));
  const requestId = useRequestId();
  const save = useAsyncAction(saveAllowance);
  const remove = useAsyncAction(deleteAllowance);

  const [amount, setAmount] = useState(amountToInput(existing?.amount));
  const [period, setPeriod] = useState<Period>(existing?.period ?? 'week');
  const [submitted, setSubmitted] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!child) {
    return (
      <Modal title="Участник не найден" onClose={closeModal}>
        <p className="text-ink-2">Возможно, он уже вышел из семьи.</p>
      </Modal>
    );
  }

  const amountError = submitted ? validateAmount(amount) : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const value = parseAmount(amount);
    if (validateAmount(amount) || value === null) return;
    const res = await save.run(memberId, value, period, requestId);
    if (!res.ok) return;
    closeModal();
    addToast(`${child.name}: ${formatCurrency(value)} ${period === 'week' ? 'в неделю' : 'в месяц'}`);
  };

  if (confirmRemove) {
    return (
      <ConfirmDialog
        title="Отменить карманные деньги?"
        confirmLabel="Отменить"
        pending={remove.pending}
        error={remove.error}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={async () => {
          const res = await remove.run(memberId);
          if (!res.ok) return;
          closeModal();
          addToast(`Карманные деньги для ${child.name} отменены`, 'info');
        }}
      >
        <p>{child.name} не сможет сам добавлять траты — только просить о покупке. Уже внесённые расходы останутся.</p>
      </ConfirmDialog>
    );
  }

  return (
    <Modal
      title={`Карманные деньги: ${child.name}`}
      description="Лимит трат на период. Траты ребёнка входят в общий бюджет по своим категориям, а сама сумма расходом не считается."
      onClose={closeModal}
      footer={
        <div className="flex items-center gap-3">
          {existing && (
            <Button variant="dangerSoft" size="lg" className="flex-1" icon={<Trash2 size={17} />} onClick={() => setConfirmRemove(true)}>
              Отменить
            </Button>
          )}
          <Button type="submit" form="allowance-form" size="lg" className="flex-1" loading={save.pending}>
            {existing ? 'Сохранить' : 'Назначить'}
          </Button>
        </div>
      }
    >
      <form id="allowance-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <span id="allowance-period" className="block text-sm font-medium text-ink-2 mb-1.5">Период</span>
          <div role="radiogroup" aria-labelledby="allowance-period" className="grid grid-cols-2 gap-1 p-1 rounded-[var(--radius-control)] bg-surface-sunken">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={period === p.value}
                onClick={() => setPeriod(p.value)}
                className={`h-10 rounded-[10px] text-[15px] font-medium transition-colors duration-100
                  ${period === p.value ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-2 hover:text-ink'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-ink-3 mt-1.5">
            {period === 'week' ? 'Неделя — с понедельника по воскресенье.' : 'Календарный месяц.'} Остаток не переносится на следующий период.
          </p>
        </div>
        <AmountField
          label="Сумма"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          emphasis
          error={amountError ?? (save.errorField === 'amount' ? save.error : null)}
          hint={existing ? `Сейчас потрачено ${formatCurrency(existing.spent)}, осталось ${formatCurrency(existing.left)}` : undefined}
          data-autofocus
        />
        {save.error && !save.errorField && <FormError>{save.error}</FormError>}
      </form>
    </Modal>
  );
}
