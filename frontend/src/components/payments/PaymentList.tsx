import { useMemo } from 'react';
import { T } from '@admiral-ds/react-ui';
import type { Payment } from '../../types';
import { useDataStore } from '../../store/dataStore';
import { useUIStore } from '../../store/uiStore';
import { formatCurrency } from '../../utils/currency';
import { formatDateShort, formatDueIn } from '../../utils/date';
import { isOverdue } from '../../domain/budget';
import { Badge, CategoryIcon } from '../ui/Misc';
import { Check, Update } from '../ui/icons';
import { paymentMethodLabel, recurrenceLabels, splitLabels } from './paymentLabels';

export function PaymentStatusBadge({ payment }: { payment: Payment }) {
  if (payment.status === 'paid') return <Badge tone="success" icon={<Check size={12} aria-hidden />}>Оплачено</Badge>;
  if (isOverdue(payment)) return <Badge tone="danger">Просрочен</Badge>;
  return <Badge tone="accent">Предстоит</Badge>;
}

function PaymentRow({ payment, paidDate }: { payment: Payment; paidDate?: string }) {
  const openModal = useUIStore((state) => state.openModal);
  const actualDate = paidDate ?? payment.dueDate;
  const open = () => openModal({ type: 'paymentDetails', paymentId: payment.id });

  return (
    <li className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 rounded-control px-1 py-3 outline-none first:pt-1 last:pb-1 hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent"
      role="button" tabIndex={0} aria-label={`Открыть платёж «${payment.title}»`} onClick={open}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } }}>
      <CategoryIcon category={payment.category} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <T font="Subtitle/Subtitle 2" className="min-w-0 flex-[1_1_7.5rem] wrap-anywhere">{payment.title}</T>
          <T font="Subtitle/Subtitle 2" className="tabular whitespace-nowrap">{formatCurrency(payment.amount)}</T>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
          <T as="time" font="Body/Body 2 Short" color="Neutral/Neutral 50" dateTime={actualDate}>
            {formatDateShort(actualDate)}
          </T>
          {payment.status === 'paid' ? <PaymentStatusBadge payment={payment} />
            : <Badge tone={isOverdue(payment) ? 'danger' : 'neutral'}>{formatDueIn(payment.dueDate)}</Badge>}
          <Badge>{splitLabels[payment.splitMode]}</Badge>
          {payment.recurrence !== 'once' && <Badge icon={<Update size={12} aria-hidden />}>
            {recurrenceLabels[payment.recurrence]}
          </Badge>}
          <Badge tone="accent">{paymentMethodLabel(payment)}</Badge>
        </div>
      </div>
    </li>
  );
}

export function PaymentList({ payments, paidDates }: {
  payments: Payment[];
  editable?: boolean;
  paidDates?: ReadonlyMap<string, string>;
}) {
  const expenses = useDataStore((state) => state.expenses);
  const actualDates = useMemo(() => paidDates ?? new Map(expenses.flatMap((expense) =>
    expense.paymentId ? [[expense.paymentId, expense.date] as const] : [])), [expenses, paidDates]);
  return <ul className="divide-y divide-line">
    {payments.map((payment) => <PaymentRow key={payment.id} payment={payment} paidDate={actualDates.get(payment.id)} />)}
  </ul>;
}
