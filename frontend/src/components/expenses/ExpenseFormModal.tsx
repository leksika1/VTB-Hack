import { useState, type FormEvent } from 'react';
import { CalendarUpdate } from '../ui/icons';
import type { AccountMode, ExpenseCategory } from '../../types';
import { saveExpense } from '../../api/client';
import { useAsyncAction, useRequestId } from '../../hooks/useAsyncAction';
import { useDataStore } from '../../store/dataStore';
import { useCurrentUser, useFamilyStore, useIsParent } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { amountToInput, parseAmount, validateAmount } from '../../utils/currency';
import { daysFromToday, formatMonthIn, todayISO, toMonthKey } from '../../utils/date';
import { Modal } from '../ui/Modal';
import { AmountField, Field, FieldError, FormError } from '../ui/Field';
import { Button } from '../ui/Button';
import { CategoryPicker } from '../ui/CategoryPicker';
import { RadioButton } from '@admiral-ds/react-ui';

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
  const [source, setSource] = useState<'shared' | 'personal'>(existing
    ? existing.accountMode?.startsWith('shared') ? 'shared' : 'personal'
    : 'shared');
  const [division, setDivision] = useState<'none' | 'equal' | 'custom'>(existing?.splitPercentages
    ? 'custom'
    : existing?.accountMode?.endsWith('_split') ? 'equal' : 'none');
  const [percentages, setPercentages] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(existing?.splitPercentages ?? {}).map(([id, value]) => [id, String(value)])));
  const accountMode: AccountMode = source === 'shared'
    ? division === 'none' ? 'shared_common' : 'shared_split'
    : division === 'none' ? 'outside' : 'personal_split';
  const [submitted, setSubmitted] = useState(false);

  // An adult may name any adult as the payer (docs/FEATURES.md §7); a child's own spending stays the child's
  const adults = family?.members.filter((m) => m.role !== 'child') ?? [];
  const payerIsAdult = adults.some((m) => m.id === initialPayer);
  const editableMode = isParent && !existing?.paymentId && (!existing || payerIsAdult);
  const choosePayer = editableMode && source === 'personal' && adults.length > 1;
  const custom = editableMode && division === 'custom';
  const entries = adults.map((member) => [member.id, percentages[member.id] ?? '0'] as const);
  const percentTotal = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0);
  const percentsValid = percentTotal === 100 && entries.every(([, value]) => /^\d{0,3}$/.test(value) && Number(value) <= 100);
  const splitError = custom && submitted && !percentsValid ? 'Укажите целые проценты от 0 до 100. Сумма долей должна быть 100%.' : null;
  // A purchase that has not happened yet belongs in the plan, not in expenses; payments are an adult's tool
  const futureMonth = viewedMonth > toMonthKey();
  const futureDate = !!date && daysFromToday(date) > 0;
  const offerPlan = !expenseId && isParent && (futureMonth || futureDate);

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
    if (!title.trim() || validateAmount(amount) || !category || !date || value === null || (custom && !percentsValid)) return;

    const payer = choosePayer && paidBy && paidBy !== initialPayer ? paidBy : undefined;
    const splitPercentages = custom ? Object.fromEntries(entries.filter(([, percent]) => Number(percent) > 0)
      .map(([id, percent]) => [id, Number(percent)])) : editableMode ? null : undefined;
    const mode = editableMode && (!existing || existing.accountMode || accountMode !== 'outside') ? accountMode : undefined;
    const res = await save.run({ id: expenseId, title, amount: value, category, date, paidBy: payer, accountMode: mode, splitPercentages }, requestId);
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
        {editableMode && (
          <fieldset className="space-y-4 rounded-control bg-surface-muted p-3 sm:p-4">
            <legend className="px-1 font-medium text-ink">Источник и деление</legend>
            <div className="flex flex-wrap gap-3">
              <RadioButton name="purchase-source" value="shared" checked={source === 'shared'} onChange={() => setSource('shared')}>
                Общий счёт
              </RadioButton>
              <RadioButton name="purchase-source" value="personal" checked={source === 'personal'} onChange={() => setSource('personal')}>
                Личная карта
              </RadioButton>
            </div>
            <div className="flex flex-wrap gap-3">
              <RadioButton name="purchase-division" value="none" checked={division === 'none'} onChange={() => setDivision('none')}>
                Без деления
              </RadioButton>
              <RadioButton name="purchase-division" value="equal" checked={division === 'equal'} onChange={() => setDivision('equal')}>
                Поровну
              </RadioButton>
              <RadioButton name="purchase-division" value="custom" checked={division === 'custom'} onChange={() => {
                setDivision('custom');
                if (!Object.keys(percentages).length) {
                  const share = Math.floor(100 / adults.length);
                  setPercentages(Object.fromEntries(adults.map((member, index) =>
                    [member.id, String(share + (index < 100 % adults.length ? 1 : 0))])));
                }
              }}>В долях</RadioButton>
            </div>
            {custom && (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  {adults.map((member) => (
                    <Field key={member.id} label={`Доля: ${member.name}`} suffix="%" inputMode="numeric" maxLength={3}
                      value={percentages[member.id] ?? ''}
                      onChange={(event) => setPercentages((previous) => ({ ...previous, [member.id]: event.target.value }))} />
                  ))}
                </div>
                {splitError || save.errorField === 'splitPercentages' ? <FieldError>{splitError ?? save.error}</FieldError> : (
                  <p className="text-sm text-ink-2" aria-live="polite">Всего {Number.isFinite(percentTotal) ? percentTotal : '—'} из 100%</p>
                )}
              </div>
            )}
          </fieldset>
        )}
        {choosePayer && (
          <fieldset>
            <legend className="block text-sm font-medium text-ink-2 mb-1.5">Кто платил</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-3">
              {adults.map((m) => (
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
