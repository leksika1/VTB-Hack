import { useState, type FormEvent } from 'react';
import { CalendarUpdate } from '../ui/icons';
import type { ExpenseCategory, SplitMode } from '../../types';
import { saveExpense } from '../../api/client';
import { useAsyncAction, useRequestId } from '../../hooks/useAsyncAction';
import { useDataStore } from '../../store/dataStore';
import { useCurrentUser, useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { amountToInput, parseAmount, validateAmount } from '../../utils/currency';
import { daysFromToday, formatMonthIn, todayISO, toMonthKey } from '../../utils/date';
import { Modal } from '../ui/Modal';
import { AmountField, Field, FieldError, FormError } from '../ui/Field';
import { Button } from '../ui/Button';
import { CategoryPicker } from '../ui/CategoryPicker';
import { RadioButton } from '@admiral-ds/react-ui';
import { SplitField } from '../ui/SplitField';
import { splitSharesFromInputs } from '../ui/split';

interface ExpenseFormModalProps {
  expenseId?: string;
  prefill?: { title?: string; amount?: number; category?: ExpenseCategory };
}

/**
 * Default date: today when viewing the current month. In another month any day would be a guess that looks like
 * a chosen fact (for a future month — like a purchase already made), so the user picks the date.
 */
function defaultDate(viewedMonth: string): string {
  return viewedMonth === toMonthKey() ? todayISO() : '';
}

export function ExpenseFormModal({ expenseId, prefill }: ExpenseFormModalProps) {
  const closeModal = useUIStore((s) => s.closeModal);
  const openModal = useUIStore((s) => s.openModal);
  const addToast = useUIStore((s) => s.addToast);
  const viewedMonth = useUIStore((s) => s.monthKey);
  const setMonthKey = useUIStore((s) => s.setMonthKey);
  const setTab = useUIStore((s) => s.setTab);
  const user = useCurrentUser();
  const family = useFamilyStore((s) => s.family);
  const existing = useDataStore((s) => (expenseId ? s.expenses.find((e) => e.id === expenseId) : undefined));
  const requestId = useRequestId();
  const save = useAsyncAction(saveExpense);

  const [title, setTitle] = useState(existing?.title ?? prefill?.title ?? '');
  const [amount, setAmount] = useState(amountToInput(existing?.amount ?? prefill?.amount));
  const [category, setCategory] = useState<ExpenseCategory | null>(existing?.category ?? prefill?.category ?? null);
  const [date, setDate] = useState(existing?.date ?? defaultDate(viewedMonth));
  const initialPayer = existing ? existing.paidBy ?? existing.authorId : user?.id ?? null;
  const [paidBy, setPaidBy] = useState(initialPayer);
  const source: 'shared' | 'personal' = existing
    ? existing.source ?? (existing.accountMode?.startsWith('shared') ? 'shared' : 'personal')
    : 'shared';
  const [splitMode, setSplitMode] = useState<SplitMode>(
    existing?.splitMode === 'shares' || existing?.splitPercentages
      ? 'shares'
      : existing?.splitMode === 'equal' || existing?.accountMode?.endsWith('_split') ? 'equal' : 'none',
  );
  const [splitMembers, setSplitMembers] = useState<string[]>(
    existing?.splitMembers ?? family?.members.map((member) => member.id) ?? [],
  );
  const [splitInputs, setSplitInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(existing?.splitShares ?? existing?.splitPercentages ?? {}).map(([id, value]) =>
      [id, String(existing?.splitShares ? value / 100 : value)])));
  const [submitted, setSubmitted] = useState(false);

  const participants = family?.members ?? [];
  const payerIsActive = participants.some((m) => m.id === initialPayer);
  const editableMode = !existing?.paymentId && (!existing || payerIsActive);
  const choosePayer = editableMode && source === 'shared' && participants.length > 1;
  const shares = splitSharesFromInputs(participants, splitInputs);
  const splitError = submitted && splitMode === 'equal' && splitMembers.length === 0
    ? 'Выберите хотя бы одного участника'
    : submitted && splitMode === 'shares' && !shares
      ? 'Доли всех участников должны быть больше нуля и в сумме дать 100%'
      : null;
  // A purchase that has not happened yet belongs in the plan, not in expenses.
  const futureMonth = viewedMonth > toMonthKey();
  const futureDate = !!date && daysFromToday(date) > 0;
  const offerPlan = !expenseId && (futureMonth || futureDate);

  const titleError = submitted && !title.trim() ? 'Укажите, что купили' : save.errorField === 'title' ? save.error : null;
  const amountError = submitted ? validateAmount(amount) : null;
  const categoryError = submitted && !category ? 'Выберите категорию' : null;
  const dateError = submitted && !date ? 'Укажите дату' : null;
  const fieldErrorShown = !!(titleError || amountError || categoryError || dateError || splitError);
  const generalError = save.error && !save.errorField ? save.error : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const value = parseAmount(amount);
    if (!title.trim() || validateAmount(amount) || !category || !date || value === null || splitError
      || (splitMode === 'equal' && splitMembers.length === 0) || (splitMode === 'shares' && !shares)) return;

    const payer = choosePayer && paidBy && paidBy !== initialPayer ? paidBy : undefined;
    const res = await save.run({
      id: expenseId,
      title,
      amount: value,
      category,
      date,
      paidBy: payer,
      splitMode: editableMode ? splitMode : undefined,
      splitMembers: editableMode && splitMode === 'equal'
        ? splitMembers
        : editableMode && splitMode === 'shares' ? participants.map((member) => member.id) : editableMode ? null : undefined,
      splitShares: editableMode && splitMode === 'shares' ? shares : editableMode ? null : undefined,
    }, requestId);
    if (!res.ok) return;

    const savedMonth = date.slice(0, 7);
    closeModal();
    if (savedMonth !== viewedMonth) {
      // The record is not visible in the current view: say where it went and offer to jump there
      addToast(`Расход сохранён ${formatMonthIn(savedMonth)}`, 'success', {
        label: 'Показать',
        onClick: () => {
          setMonthKey(savedMonth);
          setTab('analytics');
        },
      });
    } else {
      addToast(expenseId ? 'Изменения сохранены' : 'Расход добавлен');
    }
  };

  if (expenseId && !existing) {
    return (
      <Modal title="Расход не найден" onClose={closeModal}>
        <p className="text-ink-2">Возможно, его уже удалили.</p>
      </Modal>
    );
  }

  return (
    <Modal
      title={expenseId ? 'Изменить покупку' : 'Записать покупку'}
      onClose={closeModal}
      footer={
        <Button type="submit" form="expense-form" fullWidth size="lg" loading={save.pending}>
          {expenseId ? 'Сохранить изменения' : 'Записать покупку'}
        </Button>
      }
    >
      <form id="expense-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <AmountField
          label="Сумма"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          error={amountError ?? (save.errorField === 'amount' ? save.error : null)}
          emphasis
          data-autofocus
        />
        <Field
          label="Что купили"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например, продукты на неделю"
          maxLength={120}
          error={titleError}
        />
        <div>
          <CategoryPicker value={category} onChange={setCategory} />
          {categoryError && <FieldError>{categoryError}</FieldError>}
        </div>
        {source === 'personal' && existing && (
          <p className="rounded-control bg-surface-muted p-3 text-sm text-ink-2">
            Оплачено с личной карты: {participants.find((member) => member.id === (existing.paidBy ?? existing.authorId))?.name ?? 'участник'}
          </p>
        )}
        {source === 'shared' && <p className="text-sm text-ink-2">Оплата с общего счёта</p>}
        {editableMode && (
          <SplitField members={participants} mode={splitMode} onModeChange={setSplitMode}
            selectedMembers={splitMembers} onSelectedMembersChange={setSplitMembers}
            shares={splitInputs} onSharesChange={setSplitInputs}
            error={splitError ?? (save.errorField === 'splitShares' || save.errorField === 'splitMembers' ? save.error : null)} />
        )}
        {choosePayer && (
          <fieldset>
            <legend className="block text-sm font-medium text-ink-2 mb-1.5">Кто покупал</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-3">
              {participants.map((m) => (
                <RadioButton
                  key={m.id}
                  name="expense-payer"
                  value={m.id}
                  checked={paidBy === m.id}
                  onChange={() => setPaidBy(m.id)}
                >
                  {m.id === user?.id ? `${m.name} (вы)` : m.name}
                </RadioButton>
              ))}
            </div>
            {save.errorField === 'paidBy' && <FieldError>{save.error}</FieldError>}
          </fieldset>
        )}
        <Field
          label="Дата покупки"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max="2100-12-31"
          error={dateError ?? (save.errorField === 'date' ? save.error : null)}
          hint={
            !date
              ? 'Укажите день, когда покупка была совершена'
              : futureDate
                ? 'Дата ещё не наступила — расход будет учтён как уже совершённый'
                : date.slice(0, 7) !== viewedMonth
                  ? `Расход будет учтён ${formatMonthIn(date.slice(0, 7))}, а не в просматриваемом месяце`
                  : undefined
          }
        />
        {offerPlan && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 rounded-xl bg-accent-soft p-3.5">
            <p className="flex-1 text-sm text-ink">
              Покупка ещё не совершена? Запланируйте её — сумма появится в запланированных платежах, а расходом станет после оплаты.
            </p>
            <Button
              size="sm"
              variant="secondary"
              icon={<CalendarUpdate size={16} />}
              onClick={() =>
                openModal({
                  type: 'paymentForm',
                  planned: true,
                  prefill: { title: title.trim() || undefined, amount: parseAmount(amount) ?? undefined, category: category ?? undefined, dueDate: date || undefined },
                })
              }
            >
              Запланировать
            </Button>
          </div>
        )}
        {generalError && <FormError>{generalError}</FormError>}
        {submitted && fieldErrorShown && !generalError && <span className="sr-only" role="status">Исправьте ошибки в форме</span>}
      </form>
    </Modal>
  );
}
