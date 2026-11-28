import { useState, type ReactNode } from 'react';
import {
  deletePayment,
  errorMessage,
  issuePaymentInvoice,
  payPayment,
  setPaymentPaid,
  SharedAccountShortageError,
} from '../../api/client';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { usePaymentDetails } from '../../hooks/useServerData';
import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { CATEGORIES } from '../../utils/categories';
import { formatCurrency, parseAmount, validateAmount } from '../../utils/currency';
import { formatDateShort } from '../../utils/date';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { AmountField, FormError } from '../ui/Field';
import { Copy, DeleteIcon, Edit, Refresh } from '../ui/icons';
import { Badge } from '../ui/Misc';
import { Modal } from '../ui/Modal';
import { paymentMethodLabel, recurrenceLabels, splitLabels } from './paymentLabels';

export function PaymentDetailsModal({ paymentId }: { paymentId: string }) {
  const close = useUIStore((state) => state.closeModal);
  const openModal = useUIStore((state) => state.openModal);
  const toast = useUIStore((state) => state.addToast);
  const family = useFamilyStore((state) => state.family);
  const details = usePaymentDetails(paymentId);
  const setPaid = useAsyncAction(setPaymentPaid);
  const remove = useAsyncAction(deletePayment);
  const invoice = useAsyncAction(issuePaymentInvoice);
  const [confirmPay, setConfirmPay] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [paying, setPaying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [shortage, setShortage] = useState<number | null>(null);
  const [invoiceAmount, setInvoiceAmount] = useState('');

  const payment = details.data;

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label} скопирован`);
    } catch {
      toast('Не удалось скопировать', 'error');
    }
  };

  const payNow = async () => {
    setPaying(true);
    setActionError(null);
    setShortage(null);
    try {
      const expense = await payPayment(paymentId);
      setConfirmPay(false);
      toast(expense ? `«${payment?.title ?? 'Платёж'}» оплачен с общего счёта` : 'Платёж уже оплачен');
      await details.refetch();
    } catch (error) {
      setActionError(errorMessage(error));
      if (error instanceof SharedAccountShortageError) setShortage(error.shortage);
    } finally {
      setPaying(false);
    }
  };

  const togglePaid = async (paid: boolean) => {
    if (!payment) return;
    const result = await setPaid.run(payment.id, paid);
    if (!result.ok) return;
    toast(paid ? `Оплата «${payment.title}» записана` : `«${payment.title}» снова в предстоящих`);
    await details.refetch();
  };

  const deleteCurrent = async () => {
    const result = await remove.run(paymentId);
    if (!result.ok) return;
    close();
    toast('Платёж удалён');
  };

  const emulateInvoice = async () => {
    const amount = parseAmount(invoiceAmount);
    if (amount === null || validateAmount(invoiceAmount)) return;
    const result = await invoice.run(paymentId, amount);
    if (!result.ok) return;
    setInvoiceAmount('');
    toast('Счёт от поставщика выставлен');
    await details.refetch();
  };

  if (confirmDelete && payment) {
    return <ConfirmDialog title="Удалить платёж?" confirmLabel="Удалить" pending={remove.pending} error={remove.error}
      onCancel={() => setConfirmDelete(false)} onConfirm={deleteCurrent}>
      <p>«<span className="font-medium text-ink">{payment.title}</span>» исчезнет из плана семьи.</p>
    </ConfirmDialog>;
  }

  if (confirmPay && payment) {
    return <ConfirmDialog title={`Оплатить «${payment.title}»?`} confirmLabel="Оплатить" tone="primary"
      pending={paying} error={actionError} onCancel={() => {
        if (paying) return;
        setConfirmPay(false);
        setActionError(null);
        setShortage(null);
      }} onConfirm={payNow}>
      <p>{formatCurrency(payment.amount)} будут списаны с общего семейного счёта.</p>
      {shortage !== null && <Button variant="secondary" onClick={() => openModal({ type: 'accountContribution', amount: shortage })}>
        Пополнить
      </Button>}
    </ConfirmDialog>;
  }

  if (details.loading && !payment) {
    return <Modal title="Платёж" onClose={close}><p className="text-ink-2" role="status">Загружаем данные…</p></Modal>;
  }
  if (!payment) {
    return <Modal title="Платёж не найден" onClose={close} footer={<Button onClick={details.refetch}>Повторить</Button>}>
      <FormError>{details.error ?? 'Возможно, платёж уже удалён.'}</FormError>
    </Modal>;
  }

  const members = family?.members ?? [];
  const limitExceeded = payment.amountMode === 'invoice' && !!payment.invoiceIssuedAt
    && payment.limitAmount !== null && payment.amount > payment.limitAmount;
  const rule = payment.recurrenceRule;
  const recurrenceValue = payment.recurrence === 'custom' && rule
    ? `Каждые ${rule.interval} ${rule.unit === 'days' ? 'дн.' : rule.unit === 'weeks' ? 'нед.' : 'мес.'}`
    : recurrenceLabels[payment.recurrence];
  const endLabel = !rule || rule.endMode === 'never' ? 'Без окончания'
    : rule.endMode === 'date' ? `До ${rule.endDate ? formatDateShort(rule.endDate) : 'даты'}`
      : `После ${rule.occurrences ?? 0} платежей`;
  const splitRows = payment.splitMode === 'none' ? [] : (payment.splitMembers ?? []).map((id) => {
    const name = members.find((member) => member.id === id)?.name ?? 'Участник';
    const share = payment.splitMode === 'shares' ? `${(payment.splitShares?.[id] ?? 0) / 100}%` : 'поровну';
    return `${name} — ${share}`;
  });
  const manual = payment.paymentDetails;

  return (
    <Modal title={payment.title} onClose={close} size="lg" footer={<div className="flex w-full flex-wrap gap-2">
      {payment.status === 'upcoming' ? <>
        <Button className="flex-1" onClick={() => setConfirmPay(true)}>Оплатить сейчас</Button>
        <Button className="flex-1" variant="secondary" loading={setPaid.pending} onClick={() => togglePaid(true)}>Записать оплату</Button>
        <Button variant="ghost" icon={<Edit size={16} />} onClick={() => openModal({ type: 'paymentForm', paymentId })}>Изменить</Button>
        <Button variant="ghost" icon={<DeleteIcon size={16} />} onClick={() => setConfirmDelete(true)}>Удалить</Button>
      </> : <Button className="flex-1" variant="secondary" loading={setPaid.pending} onClick={() => togglePaid(false)}>Вернуть</Button>}
    </div>}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-3xl font-semibold tabular text-ink">{formatCurrency(payment.amount)}</p>
          <div className="flex flex-wrap gap-2">
            <Badge tone={payment.status === 'paid' ? 'success' : 'accent'}>{payment.status === 'paid' ? 'Оплачено' : 'Предстоит'}</Badge>
            {limitExceeded && <Badge tone="warning">Счёт больше лимита — подтвердите</Badge>}
          </div>
        </div>
        <dl className="divide-y divide-line text-sm">
          <DetailRow label="Категория" value={CATEGORIES[payment.category].label} />
          <DetailRow label="Дата платежа" value={formatDateShort(payment.dueDate)} />
          <DetailRow label="Сумма" value={payment.amountMode === 'invoice' ? `По счёту · ожидаемо ${formatCurrency(payment.amount)}` : 'Фиксированная'} />
          <DetailRow label="Повторять" value={recurrenceValue} />
          {payment.recurrence !== 'once' && <DetailRow label="Окончание" value={endLabel} />}
          <DetailRow label="Деление" value={splitLabels[payment.splitMode]} />
          {splitRows.map((row) => <DetailRow key={row} label="Участник" value={row} />)}
          <DetailRow label="Способ оплаты" value={paymentMethodLabel(payment)} />
          {payment.paymentMethod === 'autopay' && <>
            <DetailRow label="Поставщик" value={payment.providerName ?? '—'} />
            <DetailRow label="Идентификатор" value={<CopyValue value={payment.providerIdentifier} label="Идентификатор" onCopy={copy} />} />
            <DetailRow label="Лимит" value={payment.limitAmount === null ? 'Не задан' : formatCurrency(payment.limitAmount)} />
            {payment.invoiceIssuedAt && <DetailRow label="Последний выставленный счёт" value={formatCurrency(payment.amount)} />}
          </>}
          {manual && <>
            <DetailRow label="Получатель" value={manual.recipient} />
            {manual.phone && <DetailRow label="Телефон" value={<CopyValue value={manual.phone} label="Телефон" onCopy={copy} />} />}
            {manual.cardNumber && <DetailRow label="Номер карты" value={<CopyValue value={manual.cardNumber} label="Номер карты" onCopy={copy} />} />}
            {manual.account && <DetailRow label="Счёт" value={<CopyValue value={manual.account} label="Счёт" onCopy={copy} />} />}
            {manual.bic && <DetailRow label="БИК" value={manual.bic} />}
            {manual.inn && <DetailRow label="ИНН" value={manual.inn} />}
            {manual.kpp && <DetailRow label="КПП" value={manual.kpp} />}
            {manual.uin && <DetailRow label="УИН" value={<CopyValue value={manual.uin} label="УИН" onCopy={copy} />} />}
            <DetailRow label="Назначение" value={manual.purpose} />
          </>}
        </dl>
        {family?.isDemo && payment.status === 'upcoming' && payment.paymentMethod === 'autopay'
          && payment.autopayType === 'by_invoice' && <section className="space-y-3 rounded-control bg-surface-muted p-3">
          <h3 className="font-medium text-ink">Демо-сценарий счёта</h3>
          <AmountField label="Сумма счёта" value={invoiceAmount} onChange={(event) => setInvoiceAmount(event.target.value)}
            error={invoice.error ?? null} />
          <Button size="sm" variant="secondary" icon={<Refresh size={15} />} loading={invoice.pending}
            disabled={!!validateAmount(invoiceAmount)} onClick={emulateInvoice}>Эмулировать счёт от поставщика</Button>
        </section>}
        {(setPaid.error || actionError) && <FormError>{setPaid.error || actionError}</FormError>}
      </div>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return <div className="grid gap-1 py-2.5 sm:grid-cols-[12rem_minmax(0,1fr)]">
    <dt className="text-ink-2">{label}</dt><dd className="min-w-0 wrap-anywhere text-ink">{value}</dd>
  </div>;
}

function CopyValue({ value, label, onCopy }: {
  value: string | null;
  label: string;
  onCopy: (value: string, label: string) => void;
}) {
  if (!value) return <>—</>;
  return <span className="inline-flex flex-wrap items-center gap-2">
    <span className="tabular">{value}</span>
    <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => onCopy(value, label)}>Скопировать</Button>
  </span>;
}
