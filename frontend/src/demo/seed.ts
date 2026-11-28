import type { ExpenseCategory, RecurrenceRule, User } from '../types';
import { moveDateToMonth, shiftMonth } from '../utils/date';
import { LOCAL_DEMO_SCHEMA, type DemoPayment, type DemoState } from './types';

const COLORS = ['#1F5BD8', '#C2410C', '#0F766E', '#7C3AED'];
const HOUR_MS = 3_600_000;

function moscowToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function daysInMonth(month: string): number {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
}

function dateInMonth(month: string, day: number): string {
  return `${month}-${String(Math.min(Math.max(day, 1), daysInMonth(month))).padStart(2, '0')}`;
}

function relativeDay(today: string, offset: number): string {
  const day = Number(today.slice(8, 10));
  return dateInMonth(today.slice(0, 7), day + offset);
}

function payment(
  id: string,
  title: string,
  amountKop: number,
  category: ExpenseCategory,
  dueDate: string,
  authorId: string,
  extra: Partial<DemoPayment> = {},
): DemoPayment {
  const now = Date.now();
  return {
    id, title, amountKop, category, dueDate, authorId, createdAt: now - HOUR_MS,
    status: 'upcoming', expenseId: null, source: 'shared', splitMode: 'none', splitMembers: null,
    splitShares: null, accountMode: 'shared_common', amountMode: 'fixed', recurrence: 'once',
    recurrenceRule: null, recurring: false, seriesId: null, seriesSequence: null, seriesMonth: null,
    paymentMethod: 'manual', autopayType: null, providerCategory: null, providerName: null,
    providerIdentifier: null, limitAmountKop: null, paymentDetails: null, invoiceIssuedAt: null,
    ...extra,
  };
}

function nextSeriesPayment(source: DemoPayment, id: string): DemoPayment {
  const rule = source.recurrenceRule as RecurrenceRule;
  const months = rule.frequency === 'yearly' ? 12 : rule.frequency === 'quarterly' ? 3 : 1;
  const month = shiftMonth(source.dueDate.slice(0, 7), months * rule.interval);
  return {
    ...source,
    id,
    dueDate: moveDateToMonth(source.dueDate, month),
    createdAt: Date.now(),
    seriesSequence: 2,
    seriesMonth: month,
    expenseId: null,
    status: 'upcoming',
  };
}

export function createDemoSeed(): DemoState {
  const now = Date.now();
  const today = moscowToday();
  const month = today.slice(0, 7);
  const previous = shiftMonth(month, -1);
  const previous2 = shiftMonth(month, -2);
  const nextMonth = shiftMonth(month, 1);
  const familyId = 'demo-family';
  const petyaId = 'demo-petya';
  const mashaId = 'demo-masha';
  const ninaId = 'demo-nina';
  const dashaId = 'demo-dasha';
  const members: User[] = [
    { id: petyaId, name: 'Петя', color: COLORS[0], role: 'member', isOwner: true, status: 'active' },
    { id: mashaId, name: 'Маша', color: COLORS[1], role: 'member', isOwner: false, status: 'active' },
    { id: ninaId, name: 'Нина', color: COLORS[2], role: 'member', isOwner: false, status: 'active' },
  ];
  const pendingMembers: User[] = [
    { id: dashaId, name: 'Даша', color: COLORS[3], role: 'member', isOwner: false, status: 'pending', requestedAt: now - 2 * HOUR_MS },
  ];
  const splitMembers = members.map((member) => member.id);
  const internetRule: RecurrenceRule = {
    frequency: 'monthly', interval: 1, unit: null, endMode: 'never', endDate: null, occurrences: null,
  };
  const subscriptionRule: RecurrenceRule = {
    frequency: 'yearly', interval: 1, unit: null, endMode: 'never', endDate: null, occurrences: null,
  };

  const utilities = payment('demo-payment-utilities', 'ЖКУ', 650_000, 'housing', relativeDay(today, 4), petyaId, {
    splitMode: 'equal', splitMembers, accountMode: 'shared_split', amountMode: 'invoice',
    paymentMethod: 'autopay', autopayType: 'by_invoice', providerCategory: 'housing',
    providerName: 'МосОблЕИРЦ', providerIdentifier: '1234567890', limitAmountKop: 800_000,
  });
  const internet = payment('demo-payment-internet', 'Интернет', 180_000, 'other', relativeDay(today, 2), mashaId, {
    recurring: true, recurrence: 'monthly', recurrenceRule: internetRule, seriesId: 'demo-payment-internet',
    seriesSequence: 1, seriesMonth: month, paymentMethod: 'autopay', autopayType: 'by_date',
    providerCategory: 'internet', providerName: 'Домашняя сеть', providerIdentifier: 'D-77881',
  });
  const kindergarten = payment('demo-payment-kindergarten', 'Детский сад', 750_000, 'kids', relativeDay(today, 6), ninaId, {
    splitMode: 'equal', splitMembers, accountMode: 'shared_split', paymentDetails: {
      recipient: 'Детский сад № 14', method: 'uin', uin: '18810177260010000001', purpose: 'Оплата за текущий месяц',
    },
  });
  const osago = payment('demo-payment-osago', 'ОСАГО', 520_000, 'transport', relativeDay(today, 9), petyaId, {
    paymentDetails: {
      recipient: 'Страховая компания', method: 'bank_account', account: '40702810900000000001',
      bic: '044525225', inn: '7700000000', purpose: 'Полис ОСАГО',
    },
  });
  const subscription = payment('demo-payment-subscription', 'Годовая подписка', 299_000, 'other', relativeDay(today, 12), mashaId, {
    splitMode: 'equal', splitMembers, accountMode: 'shared_split', recurring: true, recurrence: 'yearly',
    recurrenceRule: subscriptionRule, seriesId: 'demo-payment-subscription', seriesSequence: 1, seriesMonth: month,
    paymentDetails: {
      recipient: 'Онлайн-сервис', method: 'card', cardNumber: '4276000012345678', purpose: 'Годовая подписка',
    },
  });

  const state: DemoState = {
    schema: LOCAL_DEMO_SCHEMA,
    familyId,
    familyName: 'Семья Смирновых',
    inviteCode: 'DEMO24',
    ownerId: petyaId,
    currentUserId: petyaId,
    members,
    pendingMembers,
    budgets: [
      {
        monthKey: month,
        totalKop: 14_000_000,
        categoryPlansKop: { food: 4_500_000, housing: 4_600_000, transport: 1_500_000, kids: 2_000_000, other: 900_000 },
        updatedAt: now,
      },
      {
        monthKey: previous,
        totalKop: 13_500_000,
        categoryPlansKop: { food: 4_500_000, housing: 4_600_000, transport: 1_500_000, kids: 2_000_000, other: 900_000 },
        updatedAt: now,
      },
    ],
    expenses: [
      {
        id: 'demo-expense-food', title: 'Продукты на неделю', amountKop: 685_040, category: 'food',
        date: relativeDay(today, -6), authorId: petyaId, paidBy: petyaId, paymentId: null, source: 'shared',
        splitMode: 'equal', splitMembers, splitShares: null, accountMode: 'shared_split', createdAt: now - HOUR_MS,
      },
      {
        id: 'demo-expense-cheese', title: 'Фрукты и сыр', amountKop: 215_000, category: 'food',
        date: relativeDay(today, -3), authorId: mashaId, paidBy: mashaId, paymentId: null, source: 'personal',
        splitMode: 'equal', splitMembers, splitShares: null, accountMode: 'personal_split', createdAt: now - HOUR_MS,
      },
      {
        id: 'demo-expense-pharmacy', title: 'Аптека', amountKop: 127_050, category: 'other',
        date: relativeDay(today, -1), authorId: ninaId, paidBy: ninaId, paymentId: null, source: 'shared',
        splitMode: 'none', splitMembers: null, splitShares: null, accountMode: 'shared_common', createdAt: now - HOUR_MS,
      },
      {
        id: 'demo-expense-fuel', title: 'Заправка', amountKop: 340_000, category: 'transport',
        date: relativeDay(today, -8), authorId: petyaId, paidBy: petyaId, paymentId: null, source: 'shared',
        splitMode: 'none', splitMembers: null, splitShares: null, accountMode: 'shared_common', createdAt: now - HOUR_MS,
      },
      {
        id: 'demo-expense-previous-food', title: 'Продукты прошлого месяца', amountKop: 3_980_000, category: 'food',
        date: dateInMonth(previous, 10), authorId: mashaId, paidBy: mashaId, paymentId: null, source: 'shared',
        splitMode: 'none', splitMembers: null, splitShares: null, accountMode: 'shared_common', createdAt: now - HOUR_MS,
      },
    ],
    payments: [
      utilities,
      internet,
      kindergarten,
      osago,
      subscription,
      nextSeriesPayment(internet, 'demo-payment-internet-next'),
      nextSeriesPayment(subscription, 'demo-payment-subscription-next'),
    ],
    accountContributions: [
      { id: 'demo-account-petya', memberId: petyaId, amountKop: 100_000, date: dateInMonth(month, 1), createdAt: now - 3 * HOUR_MS },
      { id: 'demo-account-masha', memberId: mashaId, amountKop: 1_800_000, date: dateInMonth(month, 1), createdAt: now - 2 * HOUR_MS },
      { id: 'demo-account-nina', memberId: ninaId, amountKop: 1_200_000, date: dateInMonth(month, 2), createdAt: now - HOUR_MS },
      { id: 'demo-account-previous', memberId: mashaId, amountKop: 9_000_000, date: dateInMonth(previous, 1), createdAt: now - 30 * 24 * HOUR_MS },
    ],
    goals: [{
      id: 'demo-goal-washer', title: 'Новая стиральная машина', targetKop: 6_000_000,
      deadline: dateInMonth(nextMonth, 31), status: 'active', createdBy: petyaId,
      createdAt: now - 1500 * HOUR_MS, achievedAt: null,
    }],
    goalContributions: [
      { id: 'demo-goal-part-petya', goalId: 'demo-goal-washer', memberId: petyaId, amountKop: 1_000_000, date: dateInMonth(previous2, 5), createdAt: now - 1400 * HOUR_MS },
      { id: 'demo-goal-part-masha', goalId: 'demo-goal-washer', memberId: mashaId, amountKop: 1_000_000, date: dateInMonth(previous, 5), createdAt: now - 700 * HOUR_MS },
      { id: 'demo-goal-part-nina', goalId: 'demo-goal-washer', memberId: ninaId, amountKop: 1_000_000, date: relativeDay(today, -1), createdAt: now - 20 * HOUR_MS },
    ],
    notifications: [{
      id: 'demo-notification-debt-petya', memberId: petyaId, kind: 'debt_reminder',
      title: 'Пополните свою долю на общем счёте: 2 000,14 ₽',
      body: 'Сумма рассчитана по разделённым покупкам, взносам и личным оплатам.',
      data: { month, due: 2000.14 }, dedupeKey: `debt_reminder:${month}`, createdAt: now, readAt: null,
    }],
    imports: [],
    categoryRules: {},
    preferences: Object.fromEntries(members.map((member) => [member.id, {
      debtReminderThresholdKop: 100_000,
      defaultSplit: 'ask' as const,
      calendarEnabled: true,
    }])),
    sequence: 1,
  };
  return state;
}
