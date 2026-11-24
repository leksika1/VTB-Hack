import { T } from '@admiral-ds/react-ui';
import { Check, Update, Undo } from '../ui/icons';
import type { Payment } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { formatDateShort, formatDueIn, formatMonthIn } from '../../utils/date';
import { isOverdue } from '../../domain/budget';
import { setPaymentPaid } from '../../api/client';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useUIStore } from '../../store/uiStore';
import { Badge, CategoryIcon } from '../ui/Misc';
import { Button } from '../ui/Button';

export function PaymentStatusBadge({ payment }: { payment: Payment }) {
  if (payment.status === 'paid') return <Badge tone="success" icon={<Check size={12} aria-hidden />}>Оплачено</Badge>;
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
          <T as="time" font="Body/Body 2 Short" color="Neutral/Neutral 50" dateTime={payment.dueDate}>{formatDateShort(payment.dueDate)}</T>
          {paid ? <PaymentStatusBadge payment={payment} /> : (
            <Badge tone={isOverdue(payment) ? 'danger' : 'neutral'}>{formatDueIn(payment.dueDate)}</Badge>
          )}
          {(payment.accountMode === 'shared_split' || payment.accountMode === 'shared_common') && (
            <T font="Body/Body 2 Short" color="Neutral/Neutral 70">
              {payment.accountMode === 'shared_split' ? 'С общего счёта, поровну' : 'С общего счёта'}
            </T>
          )}
          {payment.recurring && <Badge icon={<Update size={12} aria-hidden />}>Каждый месяц</Badge>}
        </div>
        <div className="mt-2 flex">
          <Button
            size="sm"
            variant={paid ? 'ghost' : 'primary'}
            icon={paid ? <Undo size={16} /> : undefined}
            className={paid ? undefined : '!px-2.5'}
            loading={toggle.pending}
            onClick={onToggle}
            aria-label={paid ? `Вернуть «${payment.title}» в предстоящие` : `Отметить «${payment.title}» оплаченным`}
          >
            {paid ? 'Вернуть' : (
              <span className="!inline-flex items-center gap-1">
                <Check size={16} className="block shrink-0" />
                Отметить оплату
              </span>
            )}
          </Button>
        </div>
        {toggle.error && <p role="alert" className="text-[13px] text-danger text-right mt-1">{toggle.error}</p>}
      </div>
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
