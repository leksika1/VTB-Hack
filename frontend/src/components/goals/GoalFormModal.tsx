import { useState, type FormEvent } from 'react';
import { Archive, Trash2 } from 'lucide-react';
import { archiveGoal, deleteGoal, saveGoal } from '../../api/client';
import { useAsyncAction, useRequestId } from '../../hooks/useAsyncAction';
import { useDataStore } from '../../store/dataStore';
import { useUIStore } from '../../store/uiStore';
import { amountToInput, formatCurrency, parseAmount, validateAmount } from '../../utils/currency';
import { todayISO } from '../../utils/date';
import { Modal } from '../ui/Modal';
import { AmountField, Field, FormError } from '../ui/Field';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';

/** Create or change a savings goal (adults). A goal with contributions is archived instead of deleted */
export function GoalFormModal({ goalId }: { goalId?: string }) {
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);
  const existing = useDataStore((s) => (goalId ? s.goals.find((g) => g.id === goalId) : undefined));
  const requestId = useRequestId();
  const save = useAsyncAction(saveGoal);
  const archive = useAsyncAction(archiveGoal);
  const remove = useAsyncAction(deleteGoal);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [target, setTarget] = useState(amountToInput(existing?.target));
  const [deadline, setDeadline] = useState(existing?.deadline ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (goalId && !existing) {
    return (
      <Modal title="Цель не найдена" onClose={closeModal}>
        <p className="text-ink-2">Возможно, её уже удалили.</p>
      </Modal>
    );
  }

  const titleError = submitted && !title.trim() ? 'Назовите цель' : save.errorField === 'title' ? save.error : null;
  const targetError = submitted ? validateAmount(target) : save.errorField === 'target' ? save.error : null;
  // Only a goal nobody has contributed to can disappear; otherwise it goes to the archive with its history
  const canDelete = existing && existing.saved === 0;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const value = parseAmount(target);
    if (!title.trim() || validateAmount(target) || value === null) return;
    const res = await save.run({ id: goalId, title: title.trim(), target: value, deadline: deadline || null }, requestId);
    if (!res.ok) return;
    closeModal();
    addToast(goalId ? 'Цель изменена' : 'Цель создана — вносить в неё может любой участник семьи');
  };

  if (confirming && existing) {
    const action = canDelete ? remove : archive;
    return (
      <ConfirmDialog
        title={canDelete ? 'Удалить цель?' : 'Убрать цель в архив?'}
        confirmLabel={canDelete ? 'Удалить' : 'В архив'}
        tone={canDelete ? 'danger' : 'primary'}
        pending={action.pending}
        error={action.error}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          const res = await action.run(existing.id);
          if (!res.ok) return;
          closeModal();
          addToast(canDelete ? 'Цель удалена' : 'Цель в архиве', 'info');
        }}
      >
        {canDelete ? (
          <p>«<span className="text-ink font-medium break-words">{existing.title}</span>» исчезнет у всех участников семьи.</p>
        ) : (
          <p>
            В цель уже отложено {formatCurrency(existing.saved)}, поэтому её нельзя удалить — история взносов сохранится. Вносить в
            архивную цель больше нельзя.
          </p>
        )}
      </ConfirmDialog>
    );
  }

  return (
    <Modal
      title={goalId ? 'Изменить цель' : 'Новая цель'}
      description="Копилка семьи: отпуск, ремонт, крупная покупка. Отложенные деньги не считаются тратой и не уменьшают бюджет месяца."
      onClose={closeModal}
      footer={
        <div className="flex items-center gap-3">
          {existing && existing.status !== 'archived' && (
            <Button
              variant={canDelete ? 'dangerSoft' : 'neutral'}
              size="lg"
              className="flex-1"
              icon={canDelete ? <Trash2 size={17} /> : <Archive size={17} />}
              onClick={() => setConfirming(true)}
            >
              {canDelete ? 'Удалить' : 'В архив'}
            </Button>
          )}
          <Button type="submit" form="goal-form" size="lg" className="flex-1" loading={save.pending}>
            {goalId ? 'Сохранить' : 'Создать цель'}
          </Button>
        </div>
      }
    >
      <form id="goal-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          label="На что копим"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например, отпуск летом"
          maxLength={80}
          error={titleError}
          data-autofocus
        />
        <AmountField label="Сколько нужно" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0" emphasis error={targetError} />
        <Field
          label="К какому сроку — необязательно"
          type="date"
          value={deadline}
          min={todayISO()}
          max="2100-12-31"
          onChange={(e) => setDeadline(e.target.value)}
          error={save.errorField === 'deadline' ? save.error : null}
          hint="Со сроком приложение посчитает, сколько откладывать в месяц"
        />
        {save.error && !save.errorField && <FormError>{save.error}</FormError>}
      </form>
    </Modal>
  );
}
