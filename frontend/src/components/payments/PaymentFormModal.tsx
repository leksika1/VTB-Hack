import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import type { ExpenseCategory } from '../../types';
import { deletePayment, savePayment } from '../../api/client';
import { useAsyncAction, useRequestId } from '../../hooks/useAsyncAction';
import { useDataStore } from '../../store/dataStore';
import { useUIStore } from '../../store/uiStore';
import { amountToInput, formatCurrency, parseAmount, validateAmount } from '../../utils/currency';
import { formatMonthIn, todayISO, toMonthKey } from '../../utils/date';
import { Modal } from '../ui/Modal';
import { AmountField, Field, FieldError, FormError } from '../ui/Field';
import { Button } from '../ui/Button';
import { CategoryPicker } from '../ui/CategoryPicker';
import { ConfirmDialog } from '../ui/ConfirmDialog';

export function PaymentFormModal({ paymentId }: { paymentId?: string }) {
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);
  const viewedMonth = useUIStore((s) => s.monthKey);
  const setMonthKey = useUIStore((s) => s.setMonthKey);
  const existing = useDataStore((s) => (paymentId ? s.payments.find((p) => p.id === paymentId) : undefined));
  const requestId = useRequestId();
  const save = useAsyncAction(savePayment);
  const remove = useAsyncAction(deletePayment);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [amount, setAmount] = useState(amountToInput(existing?.amount));
  const [category, setCategory] = useState<ExpenseCategory | null>(existing?.category ?? null);
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? (viewedMonth === toMonthKey() ? todayISO() : `${viewedMonth}-01`));
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const amountError = submitted ? validateAmount(amount) : null;
  const titleError = submitted && !title.trim() ? 'Укажите, за что платёж' : null;
  const categoryError = submitted && !category ? 'Выберите категорию' : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const value = parseAmount(amount);
    if (!title.trim() || validateAmount(amount) || !category || !dueDate || value === null) return;
    const res = await save.run({ id: paymentId, title, amount: value, category, dueDate }, requestId);
    if (!res.ok) return;
    closeModal();
    const month = dueDate.slice(0, 7);
    if (month !== viewedMonth) {
      addToast(`Платёж сохранён ${formatMonthIn(month)}`, 'success', { label: 'Показать', onClick: () => setMonthKey(month) });
    } else {
      addToast(paymentId ? 'Платёж изменён' : `Платёж добавлен — ${formatCurrency(value)} зарезервировано`);
    }
  };

  const onDelete = async () => {
    if (!paymentId) return;
    const res = await remove.run(paymentId);
    if (!res.ok) return;
    closeModal();
    addToast('Платёж удалён, резерв снят');
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
          «<span className="text-ink font-medium break-words">{existing.title}</span>» больше не будет резервировать{' '}
          {formatCurrency(existing.amount)}.
        </p>
      </ConfirmDialog>
    );
  }

  return (
    <Modal
      title={paymentId ? 'Изменить платёж' : 'Обязательный платёж'}
      description="Пока платёж не оплачен, его сумма вычитается из свободной. После оплаты он станет расходом."
      onClose={closeModal}
      footer={
        <div className="flex items-center gap-3">
          {paymentId && (
            <Button variant="dangerSoft" size="lg" className="flex-1" icon={<Trash2 size={17} />} onClick={() => setConfirmDelete(true)}>
              Удалить
            </Button>
          )}
          <Button type="submit" form="payment-form" size="lg" className="flex-1" loading={save.pending}>
            {paymentId ? 'Сохранить' : 'Добавить платёж'}
          </Button>
        </div>
      }
    >
      <form id="payment-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          label="За что"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например, коммунальные услуги"
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
          label="Оплатить до"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          error={submitted && !dueDate ? 'Укажите дату' : null}
          hint={dueDate && dueDate.slice(0, 7) !== viewedMonth ? `Платёж будет учтён в плане ${formatMonthIn(dueDate.slice(0, 7))}` : undefined}
        />
        <div>
          <CategoryPicker value={category} onChange={setCategory} label="Категория бюджета" />
          {categoryError && <FieldError>{categoryError}</FieldError>}
        </div>
        {save.error && !save.errorField && <FormError>{save.error}</FormError>}
      </form>
    </Modal>
  );
}
