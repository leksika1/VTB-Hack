import { useState, type FormEvent } from 'react';
import { contributeToAccount } from '../../api/client';
import { useAsyncAction, useRequestId } from '../../hooks/useAsyncAction';
import { useUIStore } from '../../store/uiStore';
import { amountToInput, formatCurrency, parseAmount, validateAmount } from '../../utils/currency';
import { Button } from '../ui/Button';
import { AmountField, FormError } from '../ui/Field';
import { Deposit } from '../ui/icons';
import { Modal } from '../ui/Modal';

export function AccountContributionModal({ amount }: { amount?: number }) {
  const close = useUIStore((s) => s.closeModal);
  const toast = useUIStore((s) => s.addToast);
  const request = useAsyncAction(contributeToAccount);
  const requestId = useRequestId();
  const [input, setInput] = useState(amountToInput(amount));
  const [submitted, setSubmitted] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const value = parseAmount(input);
    if (value === null || validateAmount(input)) return;
    const result = await request.run(value, requestId);
    if (result.ok) {
      close();
      toast(`Общий счёт пополнен на ${formatCurrency(result.value.amount)}`);
    }
  };

  return (
    <Modal title="Пополнить общий счёт" onClose={close}
      description="Пополнение в демо записывается в семейный бюджет. Банковское списание не выполняется."
      footer={<Button type="submit" form="account-contribution" loading={request.pending} fullWidth>Записать пополнение</Button>}>
      <form id="account-contribution" className="space-y-4" onSubmit={submit} noValidate>
        <div className="flex items-center gap-3 rounded-control bg-surface-muted p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
            <Deposit />
          </span>
          <div>
            <p className="text-xs text-ink-2">Куда</p>
            <p className="font-medium">Общий счёт</p>
          </div>
        </div>
        <AmountField label="Сумма" value={input} data-autofocus emphasis
          onChange={(event) => setInput(event.target.value)}
          error={submitted ? validateAmount(input) : null} />
        {request.error && <FormError>{request.error}</FormError>}
      </form>
    </Modal>
  );
}
