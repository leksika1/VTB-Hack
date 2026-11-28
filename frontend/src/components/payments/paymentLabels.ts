import type { Payment, RecurrenceFrequency, SplitMode } from '../../types';

export const recurrenceLabels: Record<RecurrenceFrequency, string> = {
  once: 'Разово',
  weekly: 'Каждую неделю',
  monthly: 'Каждый месяц',
  quarterly: 'Каждый квартал',
  yearly: 'Каждый год',
  custom: 'Свой период',
};

export function paymentMethodLabel(payment: Payment): string {
  if (payment.paymentMethod === 'autopay') {
    const type = payment.autopayType === 'by_invoice' ? 'по счёту'
      : payment.autopayType === 'by_date' ? 'по дате' : 'по балансу';
    return `Автоплатёж ${type}`;
  }
  const method = payment.paymentDetails?.method;
  return `Вручную · ${method === 'sbp_phone' ? 'СБП' : method === 'card' ? 'карта'
    : method === 'bank_account' ? 'счёт' : method === 'uin' ? 'УИН' : 'реквизиты'}`;
}

export const splitLabels: Record<SplitMode, string> = {
  none: 'Без деления',
  equal: 'Поровну',
  shares: 'В долях',
};
