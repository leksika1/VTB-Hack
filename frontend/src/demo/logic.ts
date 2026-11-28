import type {
  AccountContribution,
  AccountSummary,
  Analytics,
  AnalyticsCategory,
  CalendarData,
  Expense,
  Family,
  Goal,
  MonthlyBudget,
  Payment,
  RecurrenceRule,
} from '../types';
import { moveDateToMonth, shiftMonth } from '../utils/date';
import type {
  DemoAccountContribution,
  DemoExpense,
  DemoGoal,
  DemoPayment,
  DemoState,
} from './types';

const CATEGORIES = ['food', 'housing', 'transport', 'kids', 'other'] as const;

export function demoToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function rubles(kop: number): number {
  return Math.round(kop) / 100;
}

export function kopecks(amount: number): number {
  return Math.round(amount * 100);
}

export function nextId(state: DemoState, prefix: string): string {
  const id = `demo-${prefix}-${Date.now().toString(36)}-${state.sequence.toString(36)}`;
  state.sequence += 1;
  return id;
}

export function familyOut(state: DemoState): Family {
  return {
    id: state.familyId,
    name: state.familyName,
    ownerId: state.ownerId,
    isOwner: state.currentUserId === state.ownerId,
    inviteCode: state.inviteCode,
    members: state.members.map((member) => ({ ...member, isOwner: member.id === state.ownerId })),
    pendingMembers: state.pendingMembers.map((member) => ({ ...member, isOwner: false })),
    pending: false,
    isDemo: true,
  };
}

export function budgetOut(state: DemoState, budget: DemoState['budgets'][number]): MonthlyBudget {
  return {
    familyId: state.familyId,
    monthKey: budget.monthKey,
    totalAmount: rubles(budget.totalKop),
    categoryPlans: Object.fromEntries(
      CATEGORIES.map((category) => [category, rubles(budget.categoryPlansKop[category] ?? 0)]),
    ) as MonthlyBudget['categoryPlans'],
    updatedAt: budget.updatedAt,
  };
}

export function expenseOut(state: DemoState, expense: DemoExpense): Expense {
  return {
    id: expense.id,
    familyId: state.familyId,
    title: expense.title,
    amount: rubles(expense.amountKop),
    category: expense.category,
    date: expense.date,
    authorId: expense.authorId,
    authorName: state.members.find((member) => member.id === expense.authorId)?.name ?? null,
    paymentId: expense.paymentId,
    paidBy: expense.paidBy,
    source: expense.source,
    splitMode: expense.splitMode,
    splitMembers: expense.splitMembers,
    splitShares: expense.splitShares,
    accountMode: expense.accountMode,
    splitPercentages: expense.splitShares
      ? Object.fromEntries(Object.entries(expense.splitShares).map(([id, value]) => [id, value / 100]))
      : null,
    createdAt: expense.createdAt,
  };
}

function maskedDetails(payment: DemoPayment, detailed: boolean) {
  if (!payment.paymentDetails) return null;
  const details = { ...payment.paymentDetails };
  if (!detailed && details.method === 'card' && details.cardNumber) {
    const digits = details.cardNumber.replace(/\D/g, '');
    details.cardNumber = digits ? `•••• ${digits.slice(-4)}` : '••••';
  }
  return details;
}

export function paymentOut(state: DemoState, payment: DemoPayment, detailed = false): Payment {
  return {
    id: payment.id,
    familyId: state.familyId,
    title: payment.title,
    amount: rubles(payment.amountKop),
    category: payment.category,
    dueDate: payment.dueDate,
    status: payment.status,
    expenseId: payment.expenseId,
    authorId: payment.authorId,
    createdAt: payment.createdAt,
    source: payment.source,
    splitMode: payment.splitMode,
    splitMembers: payment.splitMembers,
    splitShares: payment.splitShares,
    accountMode: payment.accountMode,
    amountMode: payment.amountMode,
    recurrence: payment.recurrence,
    recurrenceRule: payment.recurrenceRule,
    recurring: payment.recurring,
    seriesId: payment.seriesId,
    paymentMethod: payment.paymentMethod,
    autopayType: payment.autopayType,
    providerCategory: payment.providerCategory,
    providerName: payment.providerName,
    providerIdentifier: payment.providerIdentifier,
    limitAmount: payment.limitAmountKop === null ? null : rubles(payment.limitAmountKop),
    paymentDetails: maskedDetails(payment, detailed),
    invoiceIssuedAt: payment.invoiceIssuedAt,
  };
}

export function contributionOut(contribution: DemoAccountContribution): AccountContribution {
  return {
    id: contribution.id,
    memberId: contribution.memberId,
    amount: rubles(contribution.amountKop),
    date: contribution.date,
    createdAt: contribution.createdAt,
  };
}

export function usesSharedAccount(record: DemoExpense | DemoPayment): boolean {
  return record.source === 'shared' || record.accountMode === 'shared_common' || record.accountMode === 'shared_split';
}

export function splitExpense(expense: DemoExpense): Record<string, number> {
  let mode = expense.splitMode;
  if (mode === 'none' && expense.accountMode === 'shared_split') mode = 'equal';
  if (mode === 'none' && expense.accountMode === 'personal_split') mode = 'equal';
  if (mode === 'none') return {};
  const members = expense.splitMembers ?? Object.keys(expense.splitShares ?? {});
  if (!members.length) return {};
  const weights = mode === 'equal'
    ? Object.fromEntries(members.map((id) => [id, 1]))
    : expense.splitShares ?? {};
  const denominator = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (!denominator) return {};
  const portions = members.map((id, index) => {
    const [amount, remainder] = divmod(expense.amountKop * (weights[id] ?? 0), denominator);
    return { id, amount, remainder, index };
  });
  let missing = expense.amountKop - portions.reduce((sum, part) => sum + part.amount, 0);
  const ranked = [...portions].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const part of ranked) {
    if (missing <= 0) break;
    part.amount += 1;
    missing -= 1;
  }
  return Object.fromEntries(portions.map(({ id, amount }) => [id, amount]));
}

function divmod(value: number, denominator: number): [number, number] {
  const quotient = Math.floor(value / denominator);
  return [quotient, value - quotient * denominator];
}

export function balanceAt(state: DemoState, cutoff: string): number {
  const incoming = state.accountContributions
    .filter((item) => item.date <= cutoff)
    .reduce((sum, item) => sum + item.amountKop, 0);
  const outgoing = state.expenses
    .filter((item) => item.date <= cutoff && usesSharedAccount(item))
    .reduce((sum, item) => sum + item.amountKop, 0);
  return incoming - outgoing;
}

export function accountSummary(state: DemoState, month: string): AccountSummary {
  const today = demoToday();
  const cutoff = month < today.slice(0, 7) ? `${month}-${String(daysInMonth(month)).padStart(2, '0')}` : today;
  const contributions = state.accountContributions
    .filter((item) => item.date.startsWith(month) && item.date <= cutoff)
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  const expenses = state.expenses.filter((item) => item.date.startsWith(month) && item.date <= cutoff);
  const values = new Map(state.members.map((member) => [member.id, { share: 0, contributed: 0, paid: 0 }]));
  for (const contribution of contributions) {
    const value = contribution.memberId ? values.get(contribution.memberId) : undefined;
    if (value) value.contributed += contribution.amountKop;
  }
  for (const expense of expenses) {
    const shares = splitExpense(expense);
    for (const [memberId, amount] of Object.entries(shares)) {
      const value = values.get(memberId);
      if (value) value.share += amount;
    }
    const payer = expense.paidBy ? values.get(expense.paidBy) : undefined;
    if (Object.keys(shares).length && (expense.source === 'personal' || expense.accountMode === 'personal_split') && payer) {
      payer.paid += expense.amountKop;
    }
  }
  const totalShare = [...values.values()].reduce((sum, value) => sum + value.share, 0);
  const totalContributed = [...values.values()].reduce((sum, value) => sum + value.contributed, 0);
  const members = state.members.map((member) => {
    const value = values.get(member.id) as { share: number; contributed: number; paid: number };
    const net = value.contributed + value.paid - value.share;
    const due = Math.max(-net, 0);
    const overpaid = Math.max(net, 0);
    return {
      memberId: member.id,
      name: member.name,
      share: rubles(value.share),
      contributed: rubles(value.contributed),
      paidPersonally: rubles(value.paid),
      due: rubles(due),
      topUpSuggestion: rubles(due),
      overpaid: rubles(overpaid),
      sharePercent: totalShare ? value.share * 100 / totalShare : 0,
      contributionPercent: totalContributed ? value.contributed * 100 / totalContributed : 0,
      status: due ? 'owes' as const : overpaid ? 'overpaid' as const : 'even' as const,
    };
  });
  const balance = balanceAt(state, cutoff);
  const planned = state.payments
    .filter((payment) => payment.dueDate.startsWith(month) && payment.status === 'upcoming' && payment.source === 'shared')
    .reduce((sum, payment) => sum + payment.amountKop, 0);
  return {
    monthKey: month,
    balance: rubles(balance),
    planned: rubles(planned),
    afterPlanned: rubles(balance - planned),
    members,
    contributions: contributions.map(contributionOut),
  };
}

export function analytics(state: DemoState, month: string, count: number): Analytics {
  const months = Array.from({ length: count }, (_, index) => shiftMonth(month, index - count + 1));
  const today = demoToday();
  let previous: number | null = null;
  const series = months.map((key) => {
    const expenses = state.expenses
      .filter((expense) => expense.date.startsWith(key))
      .reduce((sum, expense) => sum + expense.amountKop, 0);
    const monthEnd = `${key}-${String(daysInMonth(key)).padStart(2, '0')}`;
    const cutoff = today < monthEnd ? today : monthEnd;
    const change = previous === null || previous === 0 ? null : (expenses - previous) * 100 / previous;
    previous = expenses;
    return {
      month: key,
      expenses: rubles(expenses),
      accountBalance: rubles(balanceAt(state, cutoff)),
      expenseChangePercent: change,
    };
  });
  const totals = new Map<string, number>();
  for (const expense of state.expenses.filter((item) => item.date.startsWith(month))) {
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amountKop);
  }
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
  const categories: AnalyticsCategory[] = [...totals]
    .map(([category, amount]) => ({
      category: category as AnalyticsCategory['category'], amount: rubles(amount), percent: total ? amount * 100 / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
  return {
    month,
    series,
    categories,
    topCategories: categories.slice(0, 5),
    account: accountSummary(state, month),
    payments: state.payments.filter((payment) => payment.dueDate.startsWith(month)).map((payment) => paymentOut(state, payment)),
  };
}

export function calendar(state: DemoState, month: string): CalendarData {
  const today = demoToday();
  const end = shiftMonth(month, 1);
  const monthExpenses = state.expenses.filter((expense) => expense.date.startsWith(month));
  const monthPayments = state.payments.filter((payment) => payment.dueDate.startsWith(month));
  const projected = state.payments
    .filter((payment) => payment.status === 'upcoming' && payment.source === 'shared' && payment.dueDate < `${end}-01`)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const currentBalance = balanceAt(state, today);
  const days = Array.from({ length: daysInMonth(month) }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    const expenses = monthExpenses.filter((expense) => expense.date === date);
    const payments = monthPayments.filter((payment) => payment.dueDate === date);
    const planned = projected
      .filter((payment) => (payment.dueDate > today ? payment.dueDate : today) <= date)
      .reduce((sum, payment) => sum + payment.amountKop, 0);
    const balance = date < today ? balanceAt(state, date) : currentBalance - planned;
    return {
      date,
      expenses: expenses.map((expense) => expenseOut(state, expense)),
      expenseTotal: rubles(expenses.reduce((sum, expense) => sum + expense.amountKop, 0)),
      payments: payments.map((payment) => paymentOut(state, payment)),
      accountBalance: rubles(balance),
    };
  });
  const upcomingPayments = projected
    .filter((payment) => {
      const date = payment.dueDate > today ? payment.dueDate : today;
      return date >= `${month}-01` && date < `${end}-01`;
    })
    .map((payment) => paymentOut(state, payment));
  return { month, days, upcomingPayments };
}

export function goalOut(state: DemoState, goal: DemoGoal): Goal {
  const savedKop = state.goalContributions
    .filter((contribution) => contribution.goalId === goal.id)
    .reduce((sum, contribution) => sum + contribution.amountKop, 0);
  const leftKop = Math.max(goal.targetKop - savedKop, 0);
  const today = demoToday();
  let monthlyNeeded: number | null = null;
  if (goal.deadline && goal.status === 'active' && leftKop > 0) {
    const months = Math.max(monthsBetween(today, goal.deadline) + 1, 1);
    monthlyNeeded = rubles(Math.ceil(leftKop / months));
  }
  let etaMonth: string | null = null;
  if (goal.status === 'active' && leftKop > 0) {
    const rows = state.goalContributions.filter((contribution) => contribution.goalId === goal.id);
    if (rows.length) {
      const window = shiftMonth(today.slice(0, 7), -2);
      const first = [...rows].sort((a, b) => a.date.localeCompare(b.date))[0].date.slice(0, 7);
      const start = first > window ? first : window;
      const recent = rows.filter((row) => row.date.slice(0, 7) >= start).reduce((sum, row) => sum + row.amountKop, 0);
      const perMonth = recent / (monthsBetween(`${start}-01`, today) + 1);
      if (perMonth > 0) etaMonth = shiftMonth(today.slice(0, 7), Math.ceil(leftKop / perMonth) - 1);
    }
  }
  return {
    id: goal.id,
    familyId: state.familyId,
    title: goal.title,
    target: rubles(goal.targetKop),
    deadline: goal.deadline,
    status: goal.status,
    saved: rubles(savedKop),
    left: rubles(leftKop),
    percent: Math.min(100, Math.floor(savedKop * 100 / goal.targetKop)),
    monthlyNeeded,
    etaMonth,
    createdBy: goal.createdBy,
    createdAt: goal.createdAt,
    achievedAt: goal.achievedAt,
  };
}

export function refreshGoalStatus(state: DemoState, goal: DemoGoal): boolean {
  if (goal.status === 'archived') return false;
  const saved = state.goalContributions
    .filter((contribution) => contribution.goalId === goal.id)
    .reduce((sum, contribution) => sum + contribution.amountKop, 0);
  if (saved >= goal.targetKop && goal.status === 'active') {
    goal.status = 'achieved';
    goal.achievedAt = Date.now();
    return true;
  }
  if (saved < goal.targetKop && goal.status === 'achieved') {
    goal.status = 'active';
    goal.achievedAt = null;
  }
  return false;
}

export function notify(
  state: DemoState,
  memberIds: string[],
  kind: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  dedupeKey: string,
): void {
  for (const memberId of memberIds) {
    if (state.notifications.some((item) => item.memberId === memberId && item.dedupeKey === dedupeKey)) continue;
    state.notifications.push({
      id: nextId(state, 'notification'), memberId, kind, title, body, data, dedupeKey, createdAt: Date.now(), readAt: null,
    });
  }
}

export function refreshDebtReminders(state: DemoState): void {
  const month = demoToday().slice(0, 7);
  const summary = accountSummary(state, month);
  for (const member of summary.members) {
    const threshold = state.preferences[member.memberId]?.debtReminderThresholdKop ?? 100_000;
    if (kopecks(member.due) <= threshold) continue;
    const amount = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(member.due);
    notify(
      state,
      [member.memberId],
      'debt_reminder',
      `Пополните свою долю на общем счёте: ${amount} ₽`,
      'Сумма рассчитана по разделённым покупкам, взносам и личным оплатам.',
      { month, due: member.due },
      `debt_reminder:${month}`,
    );
  }
}

export function nextDue(date: string, rule: RecurrenceRule): string {
  const interval = Math.max(rule.interval || 1, 1);
  if (rule.frequency === 'weekly' || rule.frequency === 'custom' && rule.unit === 'weeks') {
    return addDays(date, 7 * interval);
  }
  if (rule.frequency === 'custom' && rule.unit === 'days') return addDays(date, interval);
  const months = rule.frequency === 'yearly' ? 12 * interval
    : rule.frequency === 'quarterly' ? 3 * interval
      : interval;
  return moveDateToMonth(date, shiftMonth(date.slice(0, 7), months));
}

export function ensureNextPayment(state: DemoState, payment: DemoPayment): DemoPayment | null {
  if (!payment.recurring || !payment.seriesId || !payment.recurrenceRule) return null;
  const dueDate = nextDue(payment.dueDate, payment.recurrenceRule);
  const sequence = (payment.seriesSequence ?? 1) + 1;
  const rule = payment.recurrenceRule;
  if (rule.endMode === 'date' && (!rule.endDate || dueDate > rule.endDate)) return null;
  if (rule.endMode === 'count' && sequence > (rule.occurrences ?? 0)) return null;
  const existing = state.payments.find((item) => item.seriesId === payment.seriesId && item.dueDate === dueDate);
  if (existing) return existing;
  const created: DemoPayment = {
    ...payment,
    id: nextId(state, 'payment'),
    dueDate,
    status: 'upcoming',
    expenseId: null,
    createdAt: Date.now(),
    seriesSequence: sequence,
    seriesMonth: dueDate.slice(0, 7),
    invoiceIssuedAt: null,
  };
  state.payments.push(created);
  return created;
}

function addDays(value: string, count: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function daysInMonth(month: string): number {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
}

function monthsBetween(start: string, end: string): number {
  const [startYear, startMonth] = start.slice(0, 7).split('-').map(Number);
  const [endYear, endMonth] = end.slice(0, 7).split('-').map(Number);
  return (endYear - startYear) * 12 + endMonth - startMonth;
}
