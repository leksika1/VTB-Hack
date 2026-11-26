import { useState, type FormEvent } from 'react';
import { DeleteIcon } from '../ui/icons';
import type { AccountMode, ExpenseCategory } from '../../types';
import { deletePayment, savePayment } from '../../api/client';
import { useAsyncAction, useRequestId } from '../../hooks/useAsyncAction';
import { useDataStore } from '../../store/dataStore';
import { useUIStore, type PurchaseDraft } from '../../store/uiStore';
import { amountToInput, formatCurrency, parseAmount, validateAmount } from '../../utils/currency';
import { formatMonthIn, todayISO, toMonthKey } from '../../utils/date';
import { Modal } from '../ui/Modal';
import { AmountField, Field, FieldError, FormError } from '../ui/Field';
import { Button } from '../ui/Button';
import { CheckboxField } from '@admiral-ds/react-ui';
import { CategoryPicker } from '../ui/CategoryPicker';
import { AccountModeField } from '../account/AccountModeField';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface PaymentFormModalProps {
  paymentId?: string;
  prefill?: PurchaseDraft & { title?: string; dueDate?: string };
  /** A future purchase: reserved exactly like a payment until it is marked paid and becomes an expense */
  planned?: boolean;
}

export function PaymentFormModal({ paymentId, prefill, planned }: PaymentFormModalProps) {
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);
  const viewedMonth = useUIStore((s) => s.monthKey);
  const setMonthKey = useUIStore((s) => s.setMonthKey);
  const existing = useDataStore((s) => (paymentId ? s.payments.find((p) => p.id === paymentId) : undefined));
  const requestId = useRequestId();
  const save = useAsyncAction(savePayment);
  const remove = useAsyncAction(deletePayment);

  const [title, setTitle] = useState(existing?.title ?? prefill?.title ?? '');
  const [amount, setAmount] = useState(amountToInput(existing?.amount ?? prefill?.amount));
  const [category, setCategory] = useState<ExpenseCategory | null>(existing?.category ?? prefill?.category ?? null);
  // A planned purchase has no natural date: the user picks it instead of getting an arbitrary one
  const [dueDate, setDueDate] = useState(
    existing?.dueDate ?? prefill?.dueDate ?? (planned ? '' : viewedMonth === toMonthKey() ? todayISO() : `${viewedMonth}-01`)
  );
  const [recurring, setRecurring] = useState(existing?.recurring ?? false);
  const [accountMode, setAccountMode] = useState<Exclude<AccountMode, 'personal_split'>>(
    existing ? existing.accountMode ?? 'outside' : 'shared_split',
  );
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const amountError = submitted ? validateAmount(amount) : null;
  const titleError = submitted && !title.trim() ? (planned ? 'Укажите, что собираетесь купить' : 'Укажите, за что платёж') : null;
  const categoryError = submitted && !category ? 'Выберите категорию' : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const value = parseAmount(amount);
    if (!title.trim() || validateAmount(amount) || !category || !dueDate || value === null) return;
    const res = await save.run({ id: paymentId, title, amount: value, category, dueDate, recurring, accountMode }, requestId);
    if (!res.ok) return;
    closeModal();
    const month = dueDate.slice(0, 7);
    if (month !== viewedMonth) {
      addToast(`${planned ? 'Покупка запланирована' : 'Платёж сохранён'} ${formatMonthIn(month)}`, 'success', { label: 'Показать', onClick: () => setMonthKey(month) });
    } else {
      addToast(
        paymentId
          ? 'Платёж изменён'
          : planned
            ? `Покупка запланирована на ${formatCurrency(value)}`
            : recurring
              ? `Ежемесячный платёж на ${formatCurrency(value)} запланирован`
              : `Платёж на ${formatCurrency(value)} запланирован`
      );
    }
  };

  const onDelete = async () => {
    if (!paymentId) return;
    const res = await remove.run(paymentId);
    if (!res.ok) return;
    closeModal();
    addToast('Платёж удалён из запланированных');
  };

  if (confirmDelete && existing) {
    return (
      <ConfirmDialog
        title="Удалить платёж?"
        confirmLabel="Удалить"
        pending={remove.pending}
        error={remove.error}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={onDelete}
      >
        <p>
          «<span className="text-ink font-medium break-words">{existing.title}</span>» на {formatCurrency(existing.amount)} исчезнет из плана.
        </p>
      </ConfirmDialog>
    );
  }

  return (
    <Modal
      title={paymentId ? 'Изменить платёж' : planned ? 'Запланировать покупку' : 'Обязательный платёж'}
      description={
        planned
          ? 'Покупка появится в запланированных платежах. После покупки запишите оплату, чтобы учесть её в расходах.'
          : 'Добавьте срок оплаты и источник средств. Когда оплатите, запишите оплату из списка платежей.'
      }
      onClose={closeModal}
      footer={
        <div className="flex items-center gap-3">
          {paymentId && (
            <Button variant="secondary" size="lg" className="flex-1" icon={<DeleteIcon size={17} />} onClick={() => setConfirmDelete(true)}>
              Удалить
            </Button>
          )}
          <Button type="submit" form="payment-form" size="lg" className="flex-1" loading={save.pending}>
            {paymentId ? 'Сохранить' : planned ? 'Запланировать' : 'Добавить платёж'}
          </Button>
        </div>
      }
    >
      <form id="payment-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          label={planned ? 'Что покупаем' : 'За что'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={planned ? 'Например, холодильник' : 'Например, коммунальные услуги'}
          maxLength={120}
          error={titleError ?? (save.errorField === 'title' ? save.error : null)}
          data-autofocus
        />
        <AmountField
          label="Сумма"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          error={amountError ?? (save.errorField === 'amount' ? save.error : null)}
        />
        <Field
          label={planned ? 'Когда планируете купить' : 'Оплатить до'}
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          error={submitted && !dueDate ? 'Укажите дату' : save.errorField === 'dueDate' ? save.error : null}
          hint={
            existing?.seriesId
              ? 'Платёж из ежемесячной серии: дату можно менять только в пределах его месяца'
              : dueDate && dueDate.slice(0, 7) !== viewedMonth
                ? `${planned ? 'Покупка будет учтена' : 'Платёж будет учтён'} в плане ${formatMonthIn(dueDate.slice(0, 7))}`
                : planned && !dueDate
                  ? 'Покупка появится в плане на выбранный месяц'
                  : undefined
          }
        />
        <div>
          <CategoryPicker value={category} onChange={setCategory} label="Категория бюджета" />
          {categoryError && <FieldError>{categoryError}</FieldError>}
        </div>
        <AccountModeField value={accountMode} onChange={setAccountMode}
          options={['shared_split', 'shared_common', 'outside']} />
        {!planned && (
          <div className="p-3.5 rounded-xl bg-surface-muted">
            <CheckboxField
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              extraText={
                existing?.recurring && !recurring
                  ? 'Новые платежи перестанут появляться. Уже созданные останутся — их можно удалить отдельно.'
                  : 'В следующем месяце появится такой же запланированный платёж. Оплату нужно записать вручную.'
              }
            >
              <span className="font-medium text-ink">Повторять каждый месяц</span>
            </CheckboxField>
          </div>
        )}
        {save.error && !save.errorField && <FormError>{save.error}</FormError>}
      </form>
    </Modal>
  );
}
