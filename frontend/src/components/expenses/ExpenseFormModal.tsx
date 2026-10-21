import { useState, type FormEvent } from 'react';
import type { ExpenseCategory } from '../../types';
import { saveExpense } from '../../api/client';
import { useAsyncAction, useRequestId } from '../../hooks/useAsyncAction';
import { useDataStore } from '../../store/dataStore';
import { useCurrentUser } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { amountToInput, parseAmount, validateAmount } from '../../utils/currency';
import { formatMonthIn, todayISO, toMonthKey } from '../../utils/date';
import { Modal } from '../ui/Modal';
import { AmountField, Field, FieldError, FormError } from '../ui/Field';
import { Button } from '../ui/Button';
import { CategoryPicker } from '../ui/CategoryPicker';

interface ExpenseFormModalProps {
  expenseId?: string;
  prefill?: { title?: string; amount?: number; category?: ExpenseCategory };
}

/** Default date: today when viewing the current month, otherwise the 1st of the viewed month */
function defaultDate(viewedMonth: string): string {
  return viewedMonth === toMonthKey() ? todayISO() : `${viewedMonth}-01`;
}

export function ExpenseFormModal({ expenseId, prefill }: ExpenseFormModalProps) {
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);
  const viewedMonth = useUIStore((s) => s.monthKey);
  const setMonthKey = useUIStore((s) => s.setMonthKey);
  const setTab = useUIStore((s) => s.setTab);
  const user = useCurrentUser();
  const existing = useDataStore((s) => (expenseId ? s.expenses.find((e) => e.id === expenseId) : undefined));
  const requestId = useRequestId();
  const save = useAsyncAction(saveExpense);

  const [title, setTitle] = useState(existing?.title ?? prefill?.title ?? '');
  const [amount, setAmount] = useState(amountToInput(existing?.amount ?? prefill?.amount));
  const [category, setCategory] = useState<ExpenseCategory | null>(existing?.category ?? prefill?.category ?? null);
  const [date, setDate] = useState(existing?.date ?? defaultDate(viewedMonth));
  const [submitted, setSubmitted] = useState(false);

  const titleError = submitted && !title.trim() ? 'Укажите, что купили' : save.errorField === 'title' ? save.error : null;
  const amountError = submitted ? validateAmount(amount) : null;
  const categoryError = submitted && !category ? 'Выберите категорию' : null;
  const dateError = submitted && !date ? 'Укажите дату' : null;
  const fieldErrorShown = !!(titleError || amountError || categoryError || dateError);
  const generalError = save.error && !save.errorField ? save.error : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const value = parseAmount(amount);
    if (!title.trim() || validateAmount(amount) || !category || !date || value === null) return;

    const res = await save.run({ id: expenseId, title, amount: value, category, date }, requestId);
    if (!res.ok) return;

    const savedMonth = date.slice(0, 7);
    closeModal();
    if (savedMonth !== viewedMonth) {
      // The record is not visible in the current view: say where it went and offer to jump there
      addToast(`Расход сохранён ${formatMonthIn(savedMonth)}`, 'success', {
        label: 'Показать',
        onClick: () => {
          setMonthKey(savedMonth);
          setTab('operations');
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
      title={expenseId ? 'Изменить расход' : 'Новый расход'}
      description={user ? `Автор — ${user.name}. Запись увидят все участники семьи.` : undefined}
      onClose={closeModal}
      footer={
        <Button type="submit" form="expense-form" fullWidth size="lg" loading={save.pending}>
          {expenseId ? 'Сохранить изменения' : 'Добавить расход'}
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
        <Field
          label="Дата покупки"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max="2100-12-31"
          error={dateError ?? (save.errorField === 'date' ? save.error : null)}
          hint={date && date.slice(0, 7) !== viewedMonth ? `Расход будет учтён ${formatMonthIn(date.slice(0, 7))}, а не в просматриваемом месяце` : undefined}
        />
        {generalError && <FormError>{generalError}</FormError>}
        {submitted && fieldErrorShown && !generalError && <span className="sr-only" role="status">Исправьте ошибки в форме</span>}
      </form>
    </Modal>
  );
}
