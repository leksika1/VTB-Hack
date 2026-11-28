import { useMemo, useState } from 'react';
import { useDataStore } from '../../store/dataStore';
import { T } from '@admiral-ds/react-ui';
import { Check, Update, Undo } from '../ui/icons';
import type { Payment } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { formatDateShort, formatDueIn } from '../../utils/date';
import { isOverdue } from '../../domain/budget';
import { usesSharedAccount } from '../../domain/familyAccount';
import { payPayment, setPaymentPaid } from '../../api/client';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useUIStore } from '../../store/uiStore';
import { Badge, CategoryIcon } from '../ui/Misc';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Presence } from '../ui/Presence';

export function PaymentStatusBadge({ payment }: { payment: Payment }) {
  if (payment.status === 'paid') return <Badge tone="success" icon={<Check size={12} aria-hidden />}>Оплачено</Badge>;
  if (isOverdue(payment)) return <Badge tone="danger">Просрочен</Badge>;
  return <Badge tone="accent">Предстоит</Badge>;
}

function PaymentRow({ payment, editable = true, paidDate }: { payment: Payment; editable?: boolean; paidDate?: string }) {
  const openModal = useUIStore((s) => s.openModal);
  const addToast = useUIStore((s) => s.addToast);
  const toggle = useAsyncAction(setPaymentPaid);
  const pay = useAsyncAction(payPayment);
  const [confirmPayment, setConfirmPayment] = useState(false);
  const paid = payment.status === 'paid';
  const canPay = !paid && usesSharedAccount(payment);

  const onToggle = async () => {
    const res = await toggle.run(payment.id, !paid);
    if (!res.ok) return;
    if (paid) addToast(`«${payment.title}» снова в запланированных`);
    else if (res.value) addToast(`Оплата «${payment.title}» записана на сегодня`);
    else addToast(`«${payment.title}» уже отмечен оплаченным`, 'info');
  };
  const onPay = async () => {
    const res = await pay.run(payment.id);
    if (!res.ok) return;
    setConfirmPayment(false);
    addToast(res.value ? `«${payment.title}» оплачен с общего счёта` : `«${payment.title}» уже оплачен`,
      res.value ? 'success' : 'info');
  };
  const canEdit = editable && !paid;

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 py-3 first:pt-1 last:pb-1">
      <CategoryIcon category={payment.category} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 flex-[1_1_7.5rem]">
            {canEdit ? (
              <T as="button" type="button" font="Subtitle/Subtitle 2" className="text-left wrap-anywhere hover:underline"
                title="Изменить платёж" onClick={() => openModal({ type: 'paymentForm', paymentId: payment.id })}>
                {payment.title}
              </T>
            ) : <T font="Subtitle/Subtitle 2" className="wrap-anywhere">{payment.title}</T>}
          </div>
          <T font="Subtitle/Subtitle 2" className="tabular whitespace-nowrap">
            {formatCurrency(payment.amount)}
          </T>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
          <T as="time" font="Body/Body 2 Short" color="Neutral/Neutral 50" dateTime={paidDate ?? payment.dueDate}>
            {formatDateShort(paidDate ?? payment.dueDate)}
          </T>
          {paid ? <PaymentStatusBadge payment={payment} /> : (
            <Badge tone={isOverdue(payment) ? 'danger' : 'neutral'}>{formatDueIn(payment.dueDate)}</Badge>
          )}
          {payment.source === 'shared' && (
            <T font="Body/Body 2 Short" color="Neutral/Neutral 70">
              {payment.splitMode === 'equal' ? 'С общего счёта, поровну' : 'С общего счёта'}
            </T>
          )}
          {payment.recurrence !== 'once' && <Badge icon={<Update size={12} aria-hidden />}>Каждый месяц</Badge>}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {canPay && (
            <Button size="sm" icon={<Check size={16} />} disabled={toggle.pending} onClick={() => setConfirmPayment(true)}
              aria-label={`Оплатить сейчас «${payment.title}»`}>
              Оплатить сейчас
            </Button>
          )}
          <Button
            size="sm"
            variant={paid ? 'ghost' : canPay ? 'secondary' : 'primary'}
            icon={paid ? <Undo size={16} /> : <Check size={16} />}
            loading={toggle.pending}
            onClick={onToggle}
            aria-label={paid ? `Вернуть «${payment.title}» в запланированные` : `Записать оплату «${payment.title}»`}
          >
            {paid ? 'Вернуть' : 'Записать оплату'}
          </Button>
        </div>
        {toggle.error && <p role="alert" className="text-[13px] text-danger text-right mt-1">{toggle.error}</p>}
      </div>
      <Presence show={confirmPayment}>
        <ConfirmDialog title={`Оплатить «${payment.title}»?`} confirmLabel="Оплатить" tone="primary"
          pending={pay.pending} error={pay.error} onCancel={() => {
            if (pay.pending) return;
            pay.reset();
            setConfirmPayment(false);
          }} onConfirm={onPay}>
          <p>В прототипе {formatCurrency(payment.amount)} будут списаны с общего счёта в семейном бюджете.</p>
        </ConfirmDialog>
      </Presence>
    </li>
  );
}

export function PaymentList({ payments, editable, paidDates }: {
  payments: Payment[];
  editable?: boolean;
  paidDates?: ReadonlyMap<string, string>;
}) {
  const expenses = useDataStore((state) => state.expenses);
  const actualDates = useMemo(() => paidDates ?? new Map(expenses.flatMap((expense) =>
    expense.paymentId ? [[expense.paymentId, expense.date] as const] : [])), [expenses, paidDates]);
  return (
    <ul className="divide-y divide-line">
      {payments.map((p) => (
        <PaymentRow key={p.id} payment={p} editable={editable} paidDate={actualDates.get(p.id)} />
      ))}
    </ul>
  );
}
