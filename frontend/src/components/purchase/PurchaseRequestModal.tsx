import { useState, type FormEvent } from 'react';
import type { ExpenseCategory } from '../../types';
import { createPurchaseRequest } from '../../api/client';
import { useAsyncAction, useRequestId } from '../../hooks/useAsyncAction';
import { useUIStore } from '../../store/uiStore';
import { parseAmount, validateAmount } from '../../utils/currency';
import { Modal } from '../ui/Modal';
import { AmountField, Field, FieldError, FormError } from '../ui/Field';
import { Button } from '../ui/Button';
import { CategoryPicker } from '../ui/CategoryPicker';

/** «Можно купить?»: the request goes to the adults; on approval it becomes a family expense */
export function PurchaseRequestModal() {
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);
  const requestId = useRequestId();
  const send = useAsyncAction(createPurchaseRequest);

  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | null>('kids');
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const amountError = submitted ? validateAmount(amount) : null;
  const titleError = submitted && !title.trim() ? 'Напишите, что хотите купить' : null;
  const categoryError = submitted && !category ? 'Выберите категорию' : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const value = parseAmount(amount);
    if (!title.trim() || validateAmount(amount) || !category || value === null) return;
    const res = await send.run({ title: title.trim(), amount: value, category, comment: comment.trim() || undefined }, requestId);
    if (!res.ok) return;
    closeModal();
    addToast('Запрос отправлен взрослым — ответ придёт сюда же');
  };

  return (
    <Modal
      title="Попросить покупку"
      description="Взрослые увидят запрос и решат. Если одобрят, покупка запишется в расходы семьи и не уменьшит карманные деньги."
      onClose={closeModal}
      footer={
        <Button type="submit" form="purchase-request-form" fullWidth size="lg" loading={send.pending}>
          Отправить запрос
        </Button>
      }
    >
      <form id="purchase-request-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <AmountField
          label="Сколько стоит"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          emphasis
          error={amountError ?? (send.errorField === 'amount' ? send.error : null)}
          data-autofocus
        />
        <Field
          label="Что хотите купить"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например, кроссовки для секции"
          maxLength={120}
          error={titleError ?? (send.errorField === 'title' ? send.error : null)}
        />
        <div>
          <CategoryPicker value={category} onChange={setCategory} />
          {categoryError && <FieldError>{categoryError}</FieldError>}
        </div>
        <Field
          label="Комментарий — необязательно"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Зачем это нужно"
          maxLength={300}
          error={send.errorField === 'comment' ? send.error : null}
        />
        {send.error && !send.errorField && <FormError>{send.error}</FormError>}
      </form>
    </Modal>
  );
}
