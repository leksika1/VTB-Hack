import { Check, Undo2 } from 'lucide-react';
import type { Payment } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { formatDueIn, formatMonthIn } from '../../utils/date';
import { isOverdue } from '../../domain/budget';
import { setPaymentPaid } from '../../api/client';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useUIStore } from '../../store/uiStore';
import { Badge } from '../ui/Misc';
import { Button } from '../ui/Button';

export function PaymentStatusBadge({ payment }: { payment: Payment }) {
  if (payment.status === 'paid') return <Badge tone="success" icon={<Check size={12} aria-hidden />}>Оплачен</Badge>;
  if (isOverdue(payment)) return <Badge tone="danger">Просрочен</Badge>;
  return <Badge tone="accent">Предстоит</Badge>;
}

export function PaymentRow({ payment, editable = true }: { payment: Payment; editable?: boolean }) {
  const openModal = useUIStore((s) => s.openModal);
  const addToast = useUIStore((s) => s.addToast);
  const toggle = useAsyncAction(setPaymentPaid);
  const paid = payment.status === 'paid';

  const onToggle = async () => {
    const res = await toggle.run(payment.id, !paid);
    if (!res.ok) return;
    addToast(
      paid
        ? `«${payment.title}» снова в предстоящих — сумма зарезервирована`
        : `«${payment.title}» оплачен и записан в расходы ${formatMonthIn(payment.dueDate.slice(0, 7))}`
    );
  };
  const canEdit = editable && !paid;

  return (
    <li className="py-3 first:pt-1 last:pb-1">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => openModal({ type: 'paymentForm', paymentId: payment.id })}
          className="flex-1 min-w-0 text-left disabled:cursor-default rounded-lg"
          title={canEdit ? 'Изменить платёж' : undefined}
        >
          <span className={`block font-medium line-clamp-2 wrap-break-word ${paid ? 'text-ink-2' : 'text-ink'}`} title={payment.title}>
            {payment.title}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2 mt-1">
            {/* A paid payment has no due date to count down to */}
            {paid ? (
              <PaymentStatusBadge payment={payment} />
            ) : (
              <Badge tone={isOverdue(payment) ? 'danger' : 'accent'}>{formatDueIn(payment.dueDate)}</Badge>
            )}
          </span>
        </button>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`font-semibold tabular whitespace-nowrap ${paid ? 'text-ink-2' : 'text-ink'}`}>
            {formatCurrency(payment.amount)}
          </span>
          {paid ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Undo2 size={15} />}
              loading={toggle.pending}
              onClick={onToggle}
              aria-label={`Вернуть «${payment.title}» в предстоящие`}
              className="h-8 px-2.5"
            >
              Вернуть
            </Button>
          ) : (
            <Button
              size="sm"
              icon={<Check size={15} />}
              loading={toggle.pending}
              onClick={onToggle}
              aria-label={`Отметить «${payment.title}» оплаченным`}
              className="h-8 px-3"
            >
              Отметить оплату
            </Button>
          )}
        </div>
      </div>
      {toggle.error && <p role="alert" className="text-[13px] text-danger text-right mt-1">{toggle.error}</p>}
    </li>
  );
}

export function PaymentList({ payments, editable }: { payments: Payment[]; editable?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {payments.map((p) => (
        <PaymentRow key={p.id} payment={p} editable={editable} />
      ))}
    </ul>
  );
}
