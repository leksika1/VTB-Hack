import { useState, type FormEvent } from 'react';
import { CalendarPlus } from 'lucide-react';
import type { ExpenseCategory } from '../../types';
import { saveExpense } from '../../api/client';
import { useAsyncAction, useRequestId } from '../../hooks/useAsyncAction';
import { useDataStore } from '../../store/dataStore';
import { resolveAuthorName, useCurrentUser, useFamilyStore, useIsParent } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { amountToInput, parseAmount, validateAmount } from '../../utils/currency';
import { daysFromToday, formatMonthIn, todayISO, toMonthKey } from '../../utils/date';
import { Modal } from '../ui/Modal';
import { AmountField, Field, FieldError, FormError } from '../ui/Field';
import { Button } from '../ui/Button';
import { CategoryPicker } from '../ui/CategoryPicker';
import { Avatar } from '../ui/Misc';

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
  const isParent = useIsParent();
  const existing = useDataStore((s) => (expenseId ? s.expenses.find((e) => e.id === expenseId) : undefined));
  const requestId = useRequestId();
  const save = useAsyncAction(saveExpense);

  const [title, setTitle] = useState(existing?.title ?? prefill?.title ?? '');
  const [amount, setAmount] = useState(amountToInput(existing?.amount ?? prefill?.amount));
  const [category, setCategory] = useState<ExpenseCategory | null>(existing?.category ?? prefill?.category ?? null);
  const [date, setDate] = useState(existing?.date ?? defaultDate(viewedMonth));
  const initialPayer = existing ? existing.paidBy ?? existing.authorId : user?.id ?? null;
  const [paidBy, setPaidBy] = useState(initialPayer);
  const [submitted, setSubmitted] = useState(false);

  // An adult may name any adult as the payer (docs/FEATURES.md §7); a child's own spending stays the child's
  const adults = family?.members.filter((m) => m.role !== 'child') ?? [];
  const payerIsAdult = adults.some((m) => m.id === initialPayer);
  const choosePayer = isParent && adults.length > 1 && (!existing || payerIsAdult);
  const othersRecord = existing && existing.authorId !== user?.id;
  // A purchase that has not happened yet belongs in the plan, not in expenses; payments are an adult's tool
  const futureMonth = viewedMonth > toMonthKey();
  const futureDate = !!date && daysFromToday(date) > 0;
  const offerPlan = !expenseId && isParent && (futureMonth || futureDate);

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

    const payer = choosePayer && paidBy && paidBy !== initialPayer ? paidBy : undefined;
    const res = await save.run({ id: expenseId, title, amount: value, category, date, paidBy: payer }, requestId);
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
      description={
        othersRecord
          ? `Запись внёс(ла) ${resolveAuthorName(family, existing.authorId, existing.authorName)}. Изменения увидят все участники семьи.`
          : user
            ? `Автор — ${user.name}. Запись увидят все участники семьи.`
            : undefined
      }
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
        {choosePayer && (
          <fieldset>
            <legend className="block text-sm font-medium text-ink-2 mb-1.5">Кто платил</legend>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {adults.map((m) => {
                const active = paidBy === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPaidBy(m.id)}
                    className={`h-11 pl-1.5 pr-4 rounded-full border inline-flex items-center gap-2 text-[15px] font-medium transition-colors
                      ${active ? 'border-accent bg-accent-soft text-accent-ink ring-1 ring-accent' : 'border-line bg-surface-muted text-ink hover:border-line-strong'}`}
                  >
                    <Avatar user={m} size="sm" />
                    {m.id === user?.id ? `${m.name} (вы)` : m.name}
                  </button>
                );
              })}
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
              Покупка ещё не совершена? Запланируйте её — сумма будет зарезервирована, а расходом станет после оплаты.
            </p>
            <Button
              size="sm"
              variant="outline"
              icon={<CalendarPlus size={16} />}
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
