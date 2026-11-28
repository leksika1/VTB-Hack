import { useState, type FormEvent } from 'react';
import { Option, Select } from '@admiral-ds/react-ui';
import type {
  AmountMode,
  AutopayType,
  ExpenseCategory,
  ManualPaymentMethod,
  PaymentDetails,
  PaymentMethod,
  ProviderCategory,
  RecurrenceEndMode,
  RecurrenceFrequency,
  RecurrenceUnit,
  SplitMode,
} from '../../types';
import { deletePayment, savePayment } from '../../api/client';
import { useAsyncAction, useRequestId } from '../../hooks/useAsyncAction';
import { useAutopayCatalog, usePaymentDetails } from '../../hooks/useServerData';
import { useDataStore } from '../../store/dataStore';
import { useUIStore, type PaymentPrefill } from '../../store/uiStore';
import { useFamilyStore } from '../../store/familyStore';
import { amountToInput, formatCurrency, parseAmount, validateAmount } from '../../utils/currency';
import { formatMonthIn, todayISO, toMonthKey } from '../../utils/date';
import { Modal } from '../ui/Modal';
import { AmountField, Field, FieldError, FormError } from '../ui/Field';
import { Button } from '../ui/Button';
import { DeleteIcon } from '../ui/icons';
import { CategoryPicker } from '../ui/CategoryPicker';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ChoiceChip } from '../ui/ChoiceChip';
import { SplitField } from '../ui/SplitField';
import { splitSharesFromInputs } from '../ui/split';

interface PaymentFormModalProps {
  paymentId?: string;
  prefill?: PaymentPrefill;
  planned?: boolean;
}

const recurrenceOptions: Array<[RecurrenceFrequency, string]> = [
  ['once', 'Разово'],
  ['weekly', 'Каждую неделю'],
  ['monthly', 'Каждый месяц'],
  ['quarterly', 'Каждый квартал'],
  ['yearly', 'Каждый год'],
  ['custom', 'Свой период'],
];

const autopayLabels: Record<AutopayType, string> = {
  by_invoice: 'По счёту',
  by_date: 'По дате',
  by_balance: 'По балансу',
};

const manualLabels: Record<ManualPaymentMethod, string> = {
  sbp_phone: 'СБП по номеру телефона',
  card: 'Номер карты',
  bank_account: 'Счёт и БИК',
  uin: 'УИН',
};

export function PaymentFormModal({ paymentId, prefill, planned }: PaymentFormModalProps) {
  const closeModal = useUIStore((state) => state.closeModal);
  const addToast = useUIStore((state) => state.addToast);
  const viewedMonth = useUIStore((state) => state.monthKey);
  const setMonthKey = useUIStore((state) => state.setMonthKey);
  const family = useFamilyStore((state) => state.family);
  const listed = useDataStore((state) => (paymentId ? state.payments.find((payment) => payment.id === paymentId) : undefined));
  const details = usePaymentDetails(paymentId);
  const existing = details.data ?? listed;
  const catalog = useAutopayCatalog();
  const requestId = useRequestId();
  const save = useAsyncAction(savePayment);
  const remove = useAsyncAction(deletePayment);

  const rule = existing?.recurrenceRule;
  const [title, setTitle] = useState(existing?.title ?? prefill?.title ?? '');
  const [category, setCategory] = useState<ExpenseCategory | null>(existing?.category ?? prefill?.category ?? null);
  const [amountMode, setAmountMode] = useState<AmountMode>(existing?.amountMode ?? 'fixed');
  const [amount, setAmount] = useState(amountToInput(existing?.amount ?? prefill?.amount));
  const [dueDate, setDueDate] = useState(
    existing?.dueDate ?? prefill?.dueDate ?? (planned ? '' : viewedMonth === toMonthKey() ? todayISO() : `${viewedMonth}-01`),
  );
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency>(existing?.recurrence ?? 'once');
  const [interval, setInterval] = useState(String(rule?.interval ?? 1));
  const [intervalUnit, setIntervalUnit] = useState<RecurrenceUnit>(rule?.unit ?? 'months');
  const [endMode, setEndMode] = useState<RecurrenceEndMode>(rule?.endMode ?? 'never');
  const [endDate, setEndDate] = useState(rule?.endDate ?? '');
  const [occurrences, setOccurrences] = useState(String(rule?.occurrences ?? 12));
  const [splitMode, setSplitMode] = useState<SplitMode>(existing?.splitMode ?? 'none');
  const [splitMembers, setSplitMembers] = useState<string[]>(existing?.splitMembers ?? family?.members.map((member) => member.id) ?? []);
  const [splitInputs, setSplitInputs] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(existing?.splitShares ?? {}).map(([id, value]) => [id, String(value / 100)]),
  ));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(existing?.paymentMethod ?? 'manual');
  const [providerCategory, setProviderCategory] = useState<ProviderCategory | ''>(existing?.providerCategory ?? '');
  const [autopayType, setAutopayType] = useState<AutopayType | ''>(existing?.autopayType ?? '');
  const [providerName, setProviderName] = useState(existing?.providerName ?? '');
  const [providerIdentifier, setProviderIdentifier] = useState(existing?.providerIdentifier ?? '');
  const [limitAmount, setLimitAmount] = useState(amountToInput(existing?.limitAmount ?? undefined));
  const oldDetails = existing?.paymentDetails;
  const [manualMethod, setManualMethod] = useState<ManualPaymentMethod>(oldDetails?.method ?? 'sbp_phone');
  const [recipient, setRecipient] = useState(oldDetails?.recipient ?? '');
  const [phone, setPhone] = useState(oldDetails?.phone ?? '');
  const [cardNumber, setCardNumber] = useState(oldDetails?.cardNumber ?? '');
  const [account, setAccount] = useState(oldDetails?.account ?? '');
  const [bic, setBic] = useState(oldDetails?.bic ?? '');
  const [inn, setInn] = useState(oldDetails?.inn ?? '');
  const [kpp, setKpp] = useState(oldDetails?.kpp ?? '');
  const [uin, setUin] = useState(oldDetails?.uin ?? '');
  const [purpose, setPurpose] = useState(oldDetails?.purpose ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const participants = family?.members ?? [];
  const shares = splitSharesFromInputs(participants, splitInputs);
  const selectedCatalog = catalog.data?.categories.find((item) => item.key === providerCategory);
  const numericAmount = parseAmount(amount) ?? 0;
  const amountError = submitted && amountMode === 'fixed' ? validateAmount(amount) : null;
  const titleError = submitted && !title.trim() ? 'Укажите, за что платёж' : null;
  const categoryError = submitted && !category ? 'Выберите категорию' : null;
  const splitError = submitted && splitMode === 'equal' && !splitMembers.length
    ? 'Выберите хотя бы одного участника'
    : submitted && splitMode === 'shares' && !shares
      ? 'Доли всех участников должны быть больше нуля и в сумме дать 100%'
      : null;

  const methodInvalid = () => {
    if (planned) return false;
    if (paymentMethod === 'autopay') {
      return !providerCategory || !autopayType || !providerName.trim() || !providerIdentifier.trim()
        || autopayType === 'by_invoice' && amountMode !== 'invoice';
    }
    const required = manualMethod === 'sbp_phone' ? phone : manualMethod === 'card' ? cardNumber
      : manualMethod === 'bank_account' ? account && bic : uin;
    return !recipient.trim() || !required || !purpose.trim();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!title.trim() || !category || !dueDate || (amountMode === 'fixed' && validateAmount(amount))
      || (splitMode === 'equal' && !splitMembers.length) || (splitMode === 'shares' && !shares)
      || recurrence === 'custom' && (!Number(interval) || Number(interval) < 1)
      || recurrence !== 'once' && endMode === 'date' && !endDate
      || recurrence !== 'once' && endMode === 'count' && (!Number(occurrences) || Number(occurrences) < 1)
      || methodInvalid()) return;

    const paymentDetails: PaymentDetails | undefined = planned || paymentMethod === 'autopay' ? undefined : {
      recipient: recipient.trim(),
      method: manualMethod,
      purpose: purpose.trim(),
      ...(manualMethod === 'sbp_phone' ? { phone: phone.trim() } : {}),
      ...(manualMethod === 'card' ? { cardNumber: cardNumber.trim() } : {}),
      ...(manualMethod === 'bank_account' ? {
        account: account.trim(), bic: bic.trim(), inn: inn.trim() || undefined, kpp: kpp.trim() || undefined,
      } : {}),
      ...(manualMethod === 'uin' ? { uin: uin.trim() } : {}),
    };
    const limit = parseAmount(limitAmount);
    const result = await save.run({
      id: paymentId,
      title,
      amount: numericAmount,
      category,
      dueDate,
      amountMode,
      recurrence,
      interval: recurrence === 'custom' ? Number(interval) : 1,
      intervalUnit: recurrence === 'custom' ? intervalUnit : null,
      endMode: recurrence === 'once' ? 'never' : endMode,
      endDate: recurrence !== 'once' && endMode === 'date' ? endDate : null,
      occurrences: recurrence !== 'once' && endMode === 'count' ? Number(occurrences) : null,
      splitMode,
      splitMembers: splitMode === 'equal' ? splitMembers : splitMode === 'shares' ? participants.map((member) => member.id) : null,
      splitShares: splitMode === 'shares' ? shares : null,
      paymentMethod: planned ? undefined : paymentMethod,
      autopayType: paymentMethod === 'autopay' && !planned ? autopayType || null : null,
      providerCategory: paymentMethod === 'autopay' && !planned ? providerCategory || null : null,
      providerName: paymentMethod === 'autopay' && !planned ? providerName.trim() : null,
      providerIdentifier: paymentMethod === 'autopay' && !planned ? providerIdentifier.trim() : null,
      limitAmount: paymentMethod === 'autopay' && limit && limit > 0 ? limit : null,
      paymentDetails,
    }, requestId);
    if (!result.ok) return;
    closeModal();
    const month = dueDate.slice(0, 7);
    if (month !== viewedMonth) {
      addToast(`${planned ? 'Покупка запланирована' : 'Платёж сохранён'} ${formatMonthIn(month)}`, 'success', {
        label: 'Показать', onClick: () => setMonthKey(month),
      });
    } else {
      addToast(paymentId ? 'Платёж изменён' : `Платёж на ${formatCurrency(numericAmount)} запланирован`);
    }
  };

  const onDelete = async () => {
    if (!paymentId) return;
    const result = await remove.run(paymentId);
    if (!result.ok) return;
    closeModal();
    addToast('Платёж удалён из запланированных');
  };

  if (confirmDelete && existing) {
    return (
      <ConfirmDialog title="Удалить платёж?" confirmLabel="Удалить" pending={remove.pending} error={remove.error}
        onCancel={() => setConfirmDelete(false)} onConfirm={onDelete}>
        <p>«<span className="font-medium text-ink break-words">{existing.title}</span>» на {formatCurrency(existing.amount)} исчезнет из плана.</p>
      </ConfirmDialog>
    );
  }

  return (
    <Modal title={paymentId ? 'Изменить платёж' : planned ? 'Запланировать покупку' : 'Добавить платёжку'}
      description="Покупки и платёжки списываются с общего семейного счёта."
      onClose={closeModal} size="lg"
      footer={<div className="flex w-full items-center gap-3">
        {paymentId && <Button variant="secondary" size="lg" className="flex-1" icon={<DeleteIcon size={17} />}
          onClick={() => setConfirmDelete(true)}>Удалить</Button>}
        <Button type="submit" form="payment-form" size="lg" className="flex-1" loading={save.pending}>
          {paymentId ? 'Сохранить' : planned ? 'Запланировать' : 'Добавить платёжку'}
        </Button>
      </div>}>
      <form id="payment-form" onSubmit={onSubmit} noValidate className="space-y-5">
        <Field label={planned ? 'Что покупаем' : 'За что'} value={title} onChange={(event) => setTitle(event.target.value)}
          placeholder="Например, коммунальные услуги" maxLength={120}
          error={titleError ?? (save.errorField === 'title' ? save.error : null)} data-autofocus />
        <div>
          <CategoryPicker value={category} onChange={setCategory} label="Категория бюджета" />
          {categoryError && <FieldError>{categoryError}</FieldError>}
        </div>
        <div className="space-y-3">
          <p className="font-medium text-ink">Сумма</p>
          <div className="flex flex-wrap gap-2">
            <ChoiceChip selected={amountMode === 'fixed'} disabled={paymentMethod === 'autopay' && autopayType === 'by_invoice'}
              onClick={() => setAmountMode('fixed')}>Фиксированная</ChoiceChip>
            <ChoiceChip selected={amountMode === 'invoice'} onClick={() => setAmountMode('invoice')}>По выставленному счёту</ChoiceChip>
          </div>
          <AmountField label={amountMode === 'invoice' ? 'Ожидаемая сумма' : 'Сумма'} value={amount}
            onChange={(event) => setAmount(event.target.value)} placeholder="0"
            error={amountError ?? (save.errorField === 'amount' ? save.error : null)} />
        </div>
        <Field label="Дата платежа" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)}
          error={submitted && !dueDate ? 'Укажите дату' : save.errorField === 'dueDate' ? save.error : null} />

        {!planned && <section className="space-y-3 border-t border-line pt-4">
          <h3 className="font-medium text-ink">Повторять</h3>
          <div className="flex flex-wrap gap-2">
            {recurrenceOptions.map(([value, label]) => <ChoiceChip key={value} selected={recurrence === value}
              onClick={() => setRecurrence(value)}>{label}</ChoiceChip>)}
          </div>
          {recurrence === 'custom' && <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
            <Field label="Каждые" type="number" min={1} max={365} value={interval}
              onChange={(event) => setInterval(event.target.value)} />
            <div className="text-sm text-ink-2">
              <span id="recurrence-unit-label">Период</span>
              <Select className="mt-1 w-full" value={intervalUnit} aria-labelledby="recurrence-unit-label"
                onChange={(event) => setIntervalUnit(event.target.value as RecurrenceUnit)}>
                <Option value="days">дней</Option><Option value="weeks">недель</Option><Option value="months">месяцев</Option>
              </Select>
            </div>
          </div>}
          {recurrence !== 'once' && <div className="space-y-3">
            <p className="text-sm font-medium text-ink-2">Окончание</p>
            <div className="flex flex-wrap gap-2">
              {([['never', 'Без окончания'], ['date', 'До даты'], ['count', 'После N платежей']] as const).map(([value, label]) =>
                <ChoiceChip key={value} selected={endMode === value} onClick={() => setEndMode(value)}>{label}</ChoiceChip>)}
            </div>
            {endMode === 'date' && <Field label="Дата окончания" type="date" value={endDate}
              onChange={(event) => setEndDate(event.target.value)} error={submitted && !endDate ? 'Укажите дату окончания' : null} />}
            {endMode === 'count' && <Field label="Количество платежей" type="number" min={1} max={1000}
              value={occurrences} onChange={(event) => setOccurrences(event.target.value)} />}
          </div>}
        </section>}

        <SplitField members={participants} mode={splitMode} onModeChange={setSplitMode}
          selectedMembers={splitMembers} onSelectedMembersChange={setSplitMembers}
          shares={splitInputs} onSharesChange={setSplitInputs}
          error={splitError ?? (save.errorField === 'splitShares' || save.errorField === 'splitMembers' ? save.error : null)} />

        {!planned && <section className="space-y-3 border-t border-line pt-4">
          <h3 className="font-medium text-ink">Способ оплаты</h3>
          <div className="flex flex-wrap gap-2">
            <ChoiceChip selected={paymentMethod === 'autopay'} onClick={() => setPaymentMethod('autopay')}>Автоплатёж ВТБ</ChoiceChip>
            <ChoiceChip selected={paymentMethod === 'manual'} onClick={() => setPaymentMethod('manual')}>Вручную по реквизитам</ChoiceChip>
          </div>
          {paymentMethod === 'autopay' ? <div className="space-y-3">
            {/* div, а не label: label перенаправляет клик на скрытый native select Admiral, и список сразу закрывается */}
            <div className="block text-sm text-ink-2">
              <span id="provider-category-label">Категория поставщика</span>
              <Select className="mt-1 w-full" value={providerCategory} aria-labelledby="provider-category-label"
                onChange={(event) => {
                  const value = event.target.value as ProviderCategory;
                  const next = catalog.data?.categories.find((item) => item.key === value);
                  const nextType = next?.autopayTypes[0] ?? '';
                  setProviderCategory(value);
                  setAutopayType(nextType);
                  if (nextType === 'by_invoice') setAmountMode('invoice');
                }}>
                <Option value="" disabled>Выберите категорию</Option>
                {catalog.data?.categories.map((item) => <Option key={item.key} value={item.key}>{item.name}</Option>)}
              </Select>
            </div>
            {selectedCatalog ? <>
              <div>
                <p className="mb-2 text-sm text-ink-2">Тип автоплатежа</p>
                <div className="flex flex-wrap gap-2">
                  {selectedCatalog.autopayTypes.map((type) => <ChoiceChip key={type} selected={autopayType === type}
                    onClick={() => { setAutopayType(type); if (type === 'by_invoice') setAmountMode('invoice'); }}>
                    {autopayLabels[type]}
                  </ChoiceChip>)}
                </div>
              </div>
              <Field label="Поставщик" value={providerName} onChange={(event) => setProviderName(event.target.value)} />
              <Field label={selectedCatalog.identifier.label} value={providerIdentifier}
                onChange={(event) => setProviderIdentifier(event.target.value)} hint={`Укажите: ${selectedCatalog.identifier.label.toLowerCase()}`} />
              <AmountField label="Лимит суммы" value={limitAmount} onChange={(event) => setLimitAmount(event.target.value)}
                hint="Если счёт больше — попросим подтвердить" />
            </> : <p className="text-sm text-ink-2">Автоплатёж в ВТБ есть для ЖКУ, связи, интернета и штрафов ГИБДД. Для остального — «Вручную по реквизитам».</p>}
          </div> : <div className="space-y-3">
            <Field label="Получатель" value={recipient} onChange={(event) => setRecipient(event.target.value)} />
            <div className="block text-sm text-ink-2">
              <span id="manual-method-label">Реквизиты</span>
              <Select className="mt-1 w-full" value={manualMethod} aria-labelledby="manual-method-label"
                onChange={(event) => setManualMethod(event.target.value as ManualPaymentMethod)}>
                {Object.entries(manualLabels).map(([value, label]) => <Option key={value} value={value}>{label}</Option>)}
              </Select>
            </div>
            {manualMethod === 'sbp_phone' && <Field label="Номер телефона" type="tel" value={phone}
              onChange={(event) => setPhone(event.target.value)} placeholder="+7 900 000-00-00" />}
            {manualMethod === 'card' && <Field label="Номер карты" inputMode="numeric" value={cardNumber}
              onChange={(event) => setCardNumber(event.target.value)} />}
            {manualMethod === 'bank_account' && <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Счёт" value={account} onChange={(event) => setAccount(event.target.value)} />
              <Field label="БИК" value={bic} onChange={(event) => setBic(event.target.value)} />
              <Field label="ИНН (необязательно)" value={inn} onChange={(event) => setInn(event.target.value)} />
              <Field label="КПП (необязательно)" value={kpp} onChange={(event) => setKpp(event.target.value)} />
            </div>}
            {manualMethod === 'uin' && <Field label="УИН" value={uin} onChange={(event) => setUin(event.target.value)}
              hint="Для детсада, школы, налогов и штрафов" />}
            <Field label="Назначение платежа" value={purpose} onChange={(event) => setPurpose(event.target.value)} />
          </div>}
          {submitted && methodInvalid() && <FieldError>Заполните обязательные реквизиты способа оплаты</FieldError>}
          {catalog.error && paymentMethod === 'autopay' && <FormError>{catalog.error}</FormError>}
        </section>}
        {save.error && <FormError>{save.error}</FormError>}
      </form>
    </Modal>
  );
}
