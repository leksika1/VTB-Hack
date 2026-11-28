import { ApiError } from '../api/errors';
import type {
  ExpenseCategory,
  PaymentDetails,
  RecurrenceFrequency,
  RecurrenceRule,
  SplitMode,
} from '../types';
import { moveDateToMonth, shiftMonth } from '../utils/date';
import {
  accountSummary,
  analytics,
  balanceAt,
  budgetOut,
  calendar,
  contributionOut,
  demoToday,
  ensureNextPayment,
  expenseOut,
  familyOut,
  goalOut,
  kopecks,
  nextId,
  notify,
  paymentOut,
  refreshDebtReminders,
  refreshGoalStatus,
  rubles,
} from './logic';
import { getDemoState, saveDemoState } from './storage';
import type {
  DemoExpense,
  DemoImport,
  DemoImportRow,
  DemoMethod,
  DemoPayment,
  DemoState,
} from './types';
import { LOCAL_DEMO_TOKEN } from './types';

const CATEGORIES: ExpenseCategory[] = ['food', 'housing', 'transport', 'kids', 'other'];
const AUTOPAY_CATALOG = {
  housing: { name: 'ЖКУ', autopayTypes: ['by_invoice', 'by_date'], identifier: { field: 'providerIdentifier', label: 'Лицевой счёт или код плательщика' } },
  mobile: { name: 'Мобильная связь', autopayTypes: ['by_balance', 'by_date'], identifier: { field: 'providerIdentifier', label: 'Номер телефона' } },
  internet: { name: 'Интернет', autopayTypes: ['by_invoice', 'by_date'], identifier: { field: 'providerIdentifier', label: 'Номер договора' } },
  traffic_fines: { name: 'Штрафы ГИБДД', autopayTypes: ['by_invoice'], identifier: { field: 'providerIdentifier', label: 'СТС или водительское удостоверение' } },
} as const;
const MANUAL_METHODS = ['sbp_phone', 'card', 'bank_account', 'uin'];

type Body = Record<string, unknown>;

export async function handleLocalDemo(method: DemoMethod, rawPath: string, rawBody?: unknown): Promise<unknown> {
  // Work on a snapshot so a validation error cannot leave a half-applied mutation in memory.
  const state = structuredClone(getDemoState());
  refreshDebtReminders(state);
  const body = isRecord(rawBody) ? rawBody : {};
  const url = new URL(rawPath, 'https://local.demo');
  const path = url.pathname;
  let result: unknown;

  if (method === 'GET' && path === '/state') result = getState(state);
  else if (method === 'GET' && path === '/family') result = familyOut(state);
  else if (method === 'POST' && path === '/family/leave') result = undefined;
  else if (method === 'POST' && path === '/family/switch-user') {
    const userId = stringValue(body.userId);
    if (!state.members.some((member) => member.id === userId)) fail('Участник не найден', undefined, 404);
    state.currentUserId = userId;
    result = { token: LOCAL_DEMO_TOKEN, currentUserId: userId, family: familyOut(state) };
  }
  else if (method === 'POST' && path === '/family/invite-links') {
    fail('В демо-семью нельзя пригласить: она видна только вам', undefined, 403);
  } else if (method === 'GET' && path === '/family/invite-links') result = [];
  else if (method === 'POST' && path === '/family/invite-code') {
    fail('В демо-семью нельзя пригласить: она видна только вам', undefined, 403);
  } else if (/^\/family\/invite-links\/[^/]+$/.test(path) && method === 'DELETE') {
    fail('Ссылка не найдена', undefined, 404);
  } else if (/^\/family\/members\/[^/]+\/approve$/.test(path) && method === 'POST') {
    result = approveMember(state, decodeSegment(path.split('/')[3]));
  } else if (/^\/family\/members\/[^/]+\/reject$/.test(path) && method === 'POST') {
    rejectMember(state, decodeSegment(path.split('/')[3]));
    result = undefined;
  } else if (/^\/family\/members\/[^/]+$/.test(path) && method === 'DELETE') {
    removeMember(state, decodeSegment(path.split('/')[3]));
    result = undefined;
  } else if (method === 'GET' && path === '/me') result = getMe(state);
  else if (method === 'DELETE' && path === '/me/oidc') fail('ВТБ ID нельзя привязать к демо-семье', undefined, 403);
  else if (method === 'GET' && path === '/auth/oidc/config') result = { enabled: false, providerName: 'ВТБ ID' };
  else if (method === 'GET' && path === '/me/preferences') result = preferencesOut(state);
  else if (method === 'PATCH' && path === '/me/preferences') result = savePreferences(state, body);
  else if (method === 'PUT' && path === '/me/email') fail('В демо-семье почта не подключается', undefined, 403);
  else if (method === 'POST' && path === '/me/email/verify') fail('В демо-семье почта не подключается', undefined, 403);
  else if (method === 'PUT' && path === '/me/notifications') fail('В демо-семье почта не подключается', undefined, 403);
  else if (method === 'DELETE' && path === '/me/email') result = undefined;
  else if (method === 'GET' && path === '/budgets') result = state.budgets.map((item) => budgetOut(state, item));
  else if (/^\/budgets\/[^/]+$/.test(path) && method === 'PUT') result = saveBudget(state, decodeSegment(path.split('/')[2]), body);
  else if (method === 'GET' && path === '/expenses') result = state.expenses.map((item) => expenseOut(state, item));
  else if (method === 'POST' && path === '/expenses') result = saveExpense(state, null, body);
  else if (/^\/expenses\/[^/]+$/.test(path) && method === 'PUT') result = saveExpense(state, decodeSegment(path.split('/')[2]), body);
  else if (/^\/expenses\/[^/]+$/.test(path) && method === 'DELETE') {
    deleteExpense(state, decodeSegment(path.split('/')[2]));
    result = undefined;
  } else if (method === 'GET' && path === '/payments') result = state.payments.map((item) => paymentOut(state, item));
  else if (method === 'GET' && path === '/payments/autopay-catalog') result = autopayCatalog();
  else if (method === 'POST' && path === '/payments/copy-previous-month') result = copyPayments(state, stringValue(body.monthKey));
  else if (method === 'POST' && path === '/payments') result = savePayment(state, null, body);
  else if (/^\/payments\/[^/]+\/paid$/.test(path) && method === 'POST') {
    result = setPaymentPaid(state, decodeSegment(path.split('/')[2]), booleanValue(body.paid), booleanValue(body.fromSharedAccount));
  } else if (/^\/payments\/[^/]+\/pay$/.test(path) && method === 'POST') {
    result = setPaymentPaid(state, decodeSegment(path.split('/')[2]), true, true);
  } else if (/^\/payments\/[^/]+\/invoice$/.test(path) && method === 'POST') {
    result = issueInvoice(state, decodeSegment(path.split('/')[2]), numberValue(body.amount));
  } else if (/^\/payments\/[^/]+$/.test(path) && method === 'GET') {
    const payment = findPayment(state, decodeSegment(path.split('/')[2]));
    result = paymentOut(state, payment, true);
  } else if (/^\/payments\/[^/]+$/.test(path) && method === 'PUT') {
    result = savePayment(state, decodeSegment(path.split('/')[2]), body);
  } else if (/^\/payments\/[^/]+$/.test(path) && method === 'DELETE') {
    deletePayment(state, decodeSegment(path.split('/')[2]));
    result = undefined;
  } else if (method === 'GET' && path === '/account/contributions') {
    result = state.accountContributions.map(contributionOut);
  } else if (method === 'POST' && path === '/account/contributions') result = addAccountContribution(state, numberValue(body.amount));
  else if (method === 'GET' && path === '/account/summary') result = accountSummary(state, monthParam(url));
  else if (method === 'GET' && path === '/analytics') {
    const count = Math.min(Math.max(Number(url.searchParams.get('months') ?? 6), 1), 24);
    result = analytics(state, monthParam(url), count);
  } else if (method === 'GET' && path === '/calendar') result = calendar(state, monthParam(url));
  else if (method === 'GET' && path === '/goals') result = listGoals(state);
  else if (method === 'POST' && path === '/goals') result = saveGoal(state, null, body);
  else if (/^\/goals\/[^/]+\/archive$/.test(path) && method === 'POST') result = archiveGoal(state, decodeSegment(path.split('/')[2]));
  else if (/^\/goals\/[^/]+\/contributions$/.test(path) && method === 'POST') {
    result = contributeToGoal(state, decodeSegment(path.split('/')[2]), numberValue(body.amount), optionalString(body.date));
  } else if (/^\/goals\/[^/]+\/contributions$/.test(path) && method === 'GET') {
    result = listGoalContributions(state, decodeSegment(path.split('/')[2]));
  } else if (/^\/goals\/[^/]+$/.test(path) && method === 'PUT') result = saveGoal(state, decodeSegment(path.split('/')[2]), body);
  else if (/^\/goals\/[^/]+$/.test(path) && method === 'DELETE') {
    deleteGoal(state, decodeSegment(path.split('/')[2]));
    result = undefined;
  } else if (method === 'GET' && path === '/imports') result = state.imports.map((item) => importOut(item, false));
  else if (method === 'POST' && path === '/imports') result = createImport(state, stringValue(body.filename), stringValue(body.content));
  else if (method === 'POST' && path === '/imports/card') result = createCardImport(state, optionalString(body.month) ?? demoToday().slice(0, 7));
  else if (/^\/imports\/[^/]+\/confirm$/.test(path) && method === 'POST') {
    result = confirmImport(state, decodeSegment(path.split('/')[2]), Array.isArray(body.rows) ? body.rows : []);
  } else if (/^\/imports\/[^/]+$/.test(path) && method === 'GET') {
    const batch = state.imports.find((item) => item.id === decodeSegment(path.split('/')[2]) && item.createdBy === state.currentUserId);
    if (!batch) fail('Импорт не найден', undefined, 404);
    result = importOut(batch);
  } else if (/^\/imports\/[^/]+$/.test(path) && method === 'DELETE') {
    discardImport(state, decodeSegment(path.split('/')[2]));
    result = undefined;
  } else if (method === 'GET' && path === '/notifications') result = listNotifications(state);
  else if (method === 'POST' && path === '/notifications/read-all') {
    for (const item of state.notifications) if (item.memberId === state.currentUserId && item.readAt === null) item.readAt = Date.now();
    result = undefined;
  } else {
    if (import.meta.env.DEV) console.warn(`[local-demo] Неизвестный маршрут: ${method} ${rawPath}`);
    fail('Недоступно в демо', undefined, 400);
  }

  if (method !== 'GET') saveDemoState(state);
  else saveDemoState(state); // сохраняет сгенерированное при старте напоминание
  return result;
}

function getState(state: DemoState) {
  const notifications = state.notifications.filter((item) => item.memberId === state.currentUserId && item.readAt === null);
  return {
    family: familyOut(state),
    currentUserId: state.currentUserId,
    unreadNotifications: notifications.length,
    budgets: state.budgets.map((item) => budgetOut(state, item)),
    expenses: [...state.expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).map((item) => expenseOut(state, item)),
    payments: [...state.payments].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt - b.createdAt).map((item) => paymentOut(state, item)),
    accountContributions: [...state.accountContributions].sort((a, b) => b.createdAt - a.createdAt).map(contributionOut),
  };
}

function getMe(state: DemoState) {
  const member = state.members.find((item) => item.id === state.currentUserId);
  if (!member) fail('Участник не найден', undefined, 404);
  const preferences = state.preferences[member.id] ?? {
    debtReminderThresholdKop: 100_000, defaultSplit: 'ask' as const, calendarEnabled: true,
  };
  return {
    id: member.id, name: member.name, role: 'member', status: 'active', vtbLinked: false,
    loginId: null, isOwner: member.id === state.ownerId, email: null, emailVerified: false,
    notifyByEmail: false, pendingEmail: null,
    debtReminderThreshold: rubles(preferences.debtReminderThresholdKop),
    defaultSplit: preferences.defaultSplit,
    calendarEnabled: preferences.calendarEnabled,
  };
}

function preferencesOut(state: DemoState) {
  const preferences = state.preferences[state.currentUserId] ?? {
    debtReminderThresholdKop: 100_000, defaultSplit: 'ask' as const, calendarEnabled: true,
  };
  return {
    debtReminderThreshold: rubles(preferences.debtReminderThresholdKop),
    defaultSplit: preferences.defaultSplit,
    calendarEnabled: preferences.calendarEnabled,
  };
}

function savePreferences(state: DemoState, body: Body) {
  const preferences = state.preferences[state.currentUserId] ?? {
    debtReminderThresholdKop: 100_000, defaultSplit: 'ask' as const, calendarEnabled: true,
  };
  if (body.debtReminderThreshold !== undefined) {
    preferences.debtReminderThresholdKop = amountKop(body.debtReminderThreshold, 'debtReminderThreshold', true);
  }
  if (body.defaultSplit !== undefined) {
    if (!['equal', 'none', 'ask'].includes(String(body.defaultSplit))) fail('Проверьте введённые данные', 'defaultSplit', 422);
    preferences.defaultSplit = body.defaultSplit as typeof preferences.defaultSplit;
  }
  if (body.calendarEnabled !== undefined) preferences.calendarEnabled = booleanValue(body.calendarEnabled);
  state.preferences[state.currentUserId] = preferences;
  refreshDebtReminders(state);
  return preferencesOut(state);
}

function requireOwner(state: DemoState): void {
  if (state.currentUserId !== state.ownerId) fail('Только владелец семьи может выполнить это действие', undefined, 403);
}

function approveMember(state: DemoState, memberId: string) {
  requireOwner(state);
  const index = state.pendingMembers.findIndex((member) => member.id === memberId);
  if (index < 0) fail('Участник или заявка не найдены', undefined, 404);
  const [member] = state.pendingMembers.splice(index, 1);
  state.members.push({ ...member, status: 'active', requestedAt: null });
  notify(state, [member.id], 'member_approved', 'Вход в семью подтверждён',
    `Петя открыл вам доступ к семье «${state.familyName}»`, { memberId }, `member_approved:${memberId}`);
  return familyOut(state);
}

function rejectMember(state: DemoState, memberId: string): void {
  requireOwner(state);
  const index = state.pendingMembers.findIndex((member) => member.id === memberId);
  if (index < 0) fail('Участник или заявка не найдены', undefined, 404);
  state.pendingMembers.splice(index, 1);
}

function removeMember(state: DemoState, memberId: string): void {
  requireOwner(state);
  if (memberId === state.ownerId) fail('Владельца семьи нельзя исключить', undefined, 409);
  const before = state.members.length + state.pendingMembers.length;
  state.members = state.members.filter((member) => member.id !== memberId);
  state.pendingMembers = state.pendingMembers.filter((member) => member.id !== memberId);
  if (before === state.members.length + state.pendingMembers.length) fail('Участник или заявка не найдены', undefined, 404);
}

function saveBudget(state: DemoState, month: string, body: Body) {
  checkMonth(month);
  const totalKop = amountKop(body.totalAmount, 'total');
  const input = isRecord(body.categoryPlans) ? body.categoryPlans : {};
  const unknown = Object.keys(input).find((category) => !CATEGORIES.includes(category as ExpenseCategory));
  if (unknown) fail('Неизвестная категория', unknown, 422);
  const categoryPlansKop = Object.fromEntries(
    CATEGORIES.map((category) => [category, amountKop(input[category] ?? 0, category, true)]),
  ) as Record<ExpenseCategory, number>;
  if (Object.values(categoryPlansKop).reduce((sum, value) => sum + value, 0) > totalKop) {
    fail('Сумма лимитов больше общего бюджета', 'total', 422);
  }
  let budget = state.budgets.find((item) => item.monthKey === month);
  if (!budget) {
    budget = { monthKey: month, totalKop, categoryPlansKop, updatedAt: Date.now() };
    state.budgets.push(budget);
  } else {
    budget.totalKop = totalKop;
    budget.categoryPlansKop = categoryPlansKop;
    budget.updatedAt = Date.now();
  }
  return budgetOut(state, budget);
}

function saveExpense(state: DemoState, id: string | null, body: Body) {
  const existing = id ? state.expenses.find((item) => item.id === id) : null;
  if (id && !existing) fail('Расход не найден — возможно, его уже удалили', undefined, 404);
  if (!existing && (body.source === 'personal' || body.accountMode === 'personal_split')) {
    fail('Личную карту можно выбрать только при импорте покупки', 'source', 422);
  }
  const title = cleanTitle(body.title);
  const amount = amountKop(body.amount);
  const category = checkCategory(body.category);
  const date = checkDate(body.date);
  const paidBy = optionalString(body.paidBy) ?? existing?.paidBy ?? state.currentUserId;
  if (!state.members.some((member) => member.id === paidBy)) fail('Участник не найден', 'paidBy', 422);
  const splitProvided = ['splitMode', 'splitMembers', 'splitShares'].some((key) => Object.hasOwn(body, key));
  const splitMode = (splitProvided ? body.splitMode : existing?.splitMode) ?? 'none';
  const split = splitConfig(state, splitMode, body.splitMembers, body.splitShares, existing ?? null);
  if (existing?.paymentId && splitProvided) fail('Источник и доли задаются в связанном платеже', 'accountMode', 422);
  const expense: DemoExpense = existing ?? {
    id: nextId(state, 'expense'), title, amountKop: amount, category, date, authorId: state.currentUserId,
    paidBy, paymentId: null, source: 'shared', splitMode: split.mode, splitMembers: split.members,
    splitShares: split.shares, accountMode: split.mode === 'none' ? 'shared_common' : 'shared_split', createdAt: Date.now(),
  };
  expense.title = title;
  expense.amountKop = amount;
  expense.category = category;
  expense.date = date;
  expense.paidBy = paidBy;
  if (!existing || splitProvided) {
    expense.splitMode = split.mode;
    expense.splitMembers = split.members;
    expense.splitShares = split.shares;
    expense.accountMode = expense.source === 'personal'
      ? split.mode === 'none' ? 'outside' : 'personal_split'
      : split.mode === 'none' ? 'shared_common' : 'shared_split';
  }
  if (!existing) state.expenses.push(expense);
  refreshDebtReminders(state);
  return expenseOut(state, expense);
}

function deleteExpense(state: DemoState, id: string): void {
  const expense = state.expenses.find((item) => item.id === id);
  if (!expense) return;
  state.expenses = state.expenses.filter((item) => item.id !== id);
  if (expense.paymentId) {
    const payment = state.payments.find((item) => item.id === expense.paymentId);
    if (payment) {
      payment.status = 'upcoming';
      payment.expenseId = null;
    }
  }
  refreshDebtReminders(state);
}

function savePayment(state: DemoState, id: string | null, body: Body) {
  const existing = id ? state.payments.find((item) => item.id === id) : null;
  if (id && !existing) fail('Платёж не найден — возможно, его уже удалили', undefined, 404);
  if (existing?.status === 'paid') fail('Платёж уже оплачен. Сначала верните его в предстоящие.', undefined, 422);
  const dueDate = checkDate(body.dueDate, 'dueDate');
  if (existing?.seriesMonth && dueDate.slice(0, 7) !== existing.seriesMonth) {
    fail('Платёж серии можно перенести только в пределах его месяца', 'dueDate', 422);
  }
  const title = cleanTitle(body.title);
  const category = checkCategory(body.category);
  const amountMode = body.amountMode === 'invoice' ? 'invoice' : 'fixed';
  const method = body.paymentMethod === undefined && existing ? existing.paymentMethod : body.paymentMethod === 'autopay' ? 'autopay' : 'manual';
  const paymentData = validatePaymentMethod(body, amountMode, method, existing ?? null);
  const split = splitConfig(state, body.splitMode ?? existing?.splitMode ?? 'none', body.splitMembers, body.splitShares, existing ?? null);
  const rule = recurrenceRule(body, dueDate, existing ?? null);
  const oldRule = existing?.recurrenceRule ? JSON.stringify(existing.recurrenceRule) : null;
  const oldDueDate = existing?.dueDate ?? null;
  const payment: DemoPayment = existing ?? {
    id: nextId(state, 'payment'), title, amountKop: paymentData.amountKop, category, dueDate,
    status: 'upcoming', expenseId: null, authorId: state.currentUserId, createdAt: Date.now(), source: 'shared',
    splitMode: split.mode, splitMembers: split.members, splitShares: split.shares,
    accountMode: split.mode === 'none' ? 'shared_common' : 'shared_split', amountMode,
    recurrence: rule?.frequency ?? 'once', recurrenceRule: rule, recurring: !!rule,
    seriesId: rule ? '' : null, seriesSequence: rule ? 1 : null, seriesMonth: rule ? dueDate.slice(0, 7) : null,
    paymentMethod: method, autopayType: paymentData.autopayType, providerCategory: paymentData.providerCategory,
    providerName: paymentData.providerName, providerIdentifier: paymentData.providerIdentifier,
    limitAmountKop: paymentData.limitAmountKop, paymentDetails: paymentData.details, invoiceIssuedAt: null,
  };
  const oldSeriesId = existing?.seriesId ?? null;
  Object.assign(payment, {
    title, amountKop: paymentData.amountKop, category, dueDate, source: 'shared' as const,
    splitMode: split.mode, splitMembers: split.members, splitShares: split.shares,
    accountMode: split.mode === 'none' ? 'shared_common' as const : 'shared_split' as const,
    amountMode, recurrence: rule?.frequency ?? 'once', recurrenceRule: rule, recurring: !!rule,
    paymentMethod: method, autopayType: paymentData.autopayType, providerCategory: paymentData.providerCategory,
    providerName: paymentData.providerName, providerIdentifier: paymentData.providerIdentifier,
    limitAmountKop: paymentData.limitAmountKop, paymentDetails: paymentData.details,
  });
  if (!existing) {
    state.payments.push(payment);
    if (rule) payment.seriesId = payment.id;
  }
  if (!rule && oldSeriesId) {
    state.payments = state.payments.filter((item) => item.id === payment.id || item.seriesId !== oldSeriesId || item.status !== 'upcoming');
    payment.seriesId = null;
    payment.seriesSequence = null;
    payment.seriesMonth = null;
  } else if (rule) {
    payment.seriesId ??= payment.id;
    payment.seriesSequence ??= 1;
    payment.seriesMonth = payment.dueDate.slice(0, 7);
    if (existing && (oldRule !== JSON.stringify(rule) || oldDueDate !== dueDate)) {
      state.payments = state.payments.filter((item) => item.id === payment.id
        || item.seriesId !== payment.seriesId
        || item.status !== 'upcoming'
        || (item.seriesSequence ?? 0) <= (payment.seriesSequence ?? 1));
    }
    const future = state.payments.filter((item) => item.seriesId === payment.seriesId && item.id !== payment.id && item.status === 'upcoming');
    for (const item of future) {
      item.title = payment.title;
      item.amountKop = payment.amountKop;
      item.category = payment.category;
      item.splitMode = payment.splitMode;
      item.splitMembers = payment.splitMembers;
      item.splitShares = payment.splitShares;
      item.accountMode = payment.accountMode;
      item.amountMode = payment.amountMode;
      item.paymentMethod = payment.paymentMethod;
      item.autopayType = payment.autopayType;
      item.providerCategory = payment.providerCategory;
      item.providerName = payment.providerName;
      item.providerIdentifier = payment.providerIdentifier;
      item.limitAmountKop = payment.limitAmountKop;
      item.paymentDetails = payment.paymentDetails;
      item.recurrence = payment.recurrence;
      item.recurrenceRule = payment.recurrenceRule;
    }
    ensureNextPayment(state, payment);
  }
  return paymentOut(state, payment);
}

function deletePayment(state: DemoState, id: string): void {
  const payment = state.payments.find((item) => item.id === id);
  if (!payment) return;
  if (payment.status === 'paid') fail('Платёж уже оплачен. Сначала верните его в предстоящие.', undefined, 422);
  state.payments = state.payments.filter((item) => item.id !== id);
}

function findPayment(state: DemoState, id: string): DemoPayment {
  const payment = state.payments.find((item) => item.id === id);
  if (!payment) fail('Платёж не найден', undefined, 404);
  return payment;
}

function setPaymentPaid(state: DemoState, id: string, paid: boolean, shared: boolean) {
  const payment = findPayment(state, id);
  if (shared && !paid) fail('Выберите оплату с общего счёта', undefined, 422);
  if (paid) {
    if (payment.status === 'paid') return { payment: paymentOut(state, payment), expense: null };
    if (payment.amountKop <= 0) fail('Сначала укажите сумму выставленного счёта', 'amount', 422);
    if (shared) {
      if (payment.accountMode !== 'shared_split' && payment.accountMode !== 'shared_common') {
        fail('Этот платёж запланирован с другого источника', undefined, 422);
      }
      const shortage = payment.amountKop - balanceAt(state, demoToday());
      if (shortage > 0) {
        const formatted = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rubles(shortage));
        fail(`На общем счёте недостаточно денег: не хватает ${formatted} ₽`, undefined, 409);
      }
    }
    const expense: DemoExpense = {
      id: nextId(state, 'expense'), title: payment.title, amountKop: payment.amountKop,
      category: payment.category, date: demoToday(), authorId: state.currentUserId, paidBy: state.currentUserId,
      paymentId: payment.id, source: 'shared', splitMode: payment.splitMode, splitMembers: payment.splitMembers,
      splitShares: payment.splitShares, accountMode: payment.accountMode, createdAt: Date.now(),
    };
    state.expenses.push(expense);
    payment.status = 'paid';
    payment.expenseId = expense.id;
    ensureNextPayment(state, payment);
    refreshDebtReminders(state);
    return { payment: paymentOut(state, payment), expense: expenseOut(state, expense) };
  }
  if (payment.status === 'upcoming') return { payment: paymentOut(state, payment), expense: null };
  state.expenses = state.expenses.filter((item) => item.paymentId !== payment.id);
  payment.status = 'upcoming';
  payment.expenseId = null;
  refreshDebtReminders(state);
  return { payment: paymentOut(state, payment), expense: null };
}

function issueInvoice(state: DemoState, id: string, amount: number) {
  const payment = findPayment(state, id);
  if (payment.status !== 'upcoming' || payment.amountMode !== 'invoice') {
    fail('Этот платёж не ожидает выставления счёта', 'amount', 422);
  }
  payment.amountKop = amountKop(amount);
  payment.invoiceIssuedAt = Date.now();
  if (payment.paymentMethod === 'autopay' && payment.autopayType === 'by_invoice') attemptAutopay(state, payment);
  return paymentOut(state, payment);
}

function attemptAutopay(state: DemoState, payment: DemoPayment): void {
  if (payment.limitAmountKop !== null && payment.amountKop > payment.limitAmountKop) {
    notify(state, state.members.map((member) => member.id), 'autopay_limit',
      `Счёт «${payment.title}» больше лимита — подтвердите оплату`,
      `Счёт ${formatMoney(payment.amountKop)} ₽, лимит ${formatMoney(payment.limitAmountKop)} ₽`,
      { paymentId: payment.id }, `autopay_limit:${payment.id}:${payment.amountKop}`);
    return;
  }
  try {
    setPaymentPaid(state, payment.id, true, true);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error;
    notify(state, state.members.map((member) => member.id), 'autopay_shortage',
      `Не хватает денег на «${payment.title}»`, 'Пополните общий счёт или оплатите вручную',
      { paymentId: payment.id }, `autopay_shortage:${payment.id}:${payment.amountKop}`);
  }
}

function copyPayments(state: DemoState, month: string) {
  checkMonth(month);
  const existing = new Set(state.payments.filter((payment) => payment.dueDate.startsWith(month)).map((payment) => payment.title));
  const previous = state.payments.filter((payment) => payment.dueDate.startsWith(shiftMonth(month, -1)));
  const created: DemoPayment[] = [];
  for (const payment of previous) {
    if (existing.has(payment.title) || payment.seriesId) continue;
    existing.add(payment.title);
    const copy: DemoPayment = {
      ...payment, id: nextId(state, 'payment'), dueDate: moveDateToMonth(payment.dueDate, month),
      status: 'upcoming', expenseId: null, authorId: state.currentUserId, createdAt: Date.now(),
      seriesId: null, seriesSequence: null, seriesMonth: null, recurrence: 'once', recurrenceRule: null, recurring: false,
      invoiceIssuedAt: null,
    };
    state.payments.push(copy);
    created.push(copy);
  }
  return { added: created.length, payments: created.map((item) => paymentOut(state, item)) };
}

function addAccountContribution(state: DemoState, amount: number) {
  const contribution = {
    id: nextId(state, 'account'), memberId: state.currentUserId, amountKop: amountKop(amount),
    date: demoToday(), createdAt: Date.now(),
  };
  state.accountContributions.push(contribution);
  const own = accountSummary(state, demoToday().slice(0, 7)).members.find((item) => item.memberId === state.currentUserId);
  refreshDebtReminders(state);
  return { ...contributionOut(contribution), topUpSuggestion: own?.due ?? 0 };
}

function listGoals(state: DemoState) {
  return [...state.goals]
    .sort((a, b) => Number(a.status === 'archived') - Number(b.status === 'archived') || b.createdAt - a.createdAt)
    .map((goal) => goalOut(state, goal));
}

function listGoalContributions(state: DemoState, id: string) {
  if (!state.goals.some((goal) => goal.id === id)) fail('Цель не найдена', undefined, 404);
  return state.goalContributions
    .filter((item) => item.goalId === id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .map((item) => ({
      id: item.id, goalId: item.goalId, memberId: item.memberId,
      amount: rubles(item.amountKop), date: item.date, createdAt: item.createdAt,
    }));
}

function saveGoal(state: DemoState, id: string | null, body: Body) {
  const title = stringValue(body.title).trim();
  if (!title) fail('Укажите название цели', 'title', 422);
  if (title.length > 80) fail('Название длиннее 80 символов', 'title', 422);
  const targetKop = amountKop(body.target, 'target');
  const deadline = optionalString(body.deadline);
  if (deadline) {
    checkDate(deadline, 'deadline');
    if (deadline < demoToday()) fail('Срок не может быть в прошлом', 'deadline', 422);
  }
  let goal = id ? state.goals.find((item) => item.id === id) : undefined;
  if (id && !goal) fail('Цель не найдена', undefined, 404);
  if (!goal) {
    if (state.goals.filter((item) => item.status !== 'archived').length >= 20) {
      fail('Не больше 20 целей одновременно. Архивируйте достигнутые.', undefined, 409);
    }
    goal = { id: nextId(state, 'goal'), title, targetKop, deadline, status: 'active', createdBy: state.currentUserId, createdAt: Date.now(), achievedAt: null };
    state.goals.push(goal);
  } else {
    goal.title = title;
    goal.targetKop = targetKop;
    goal.deadline = deadline;
    refreshGoalStatus(state, goal);
  }
  return goalOut(state, goal);
}

function archiveGoal(state: DemoState, id: string) {
  const goal = state.goals.find((item) => item.id === id);
  if (!goal) fail('Цель не найдена', undefined, 404);
  goal.status = 'archived';
  return goalOut(state, goal);
}

function deleteGoal(state: DemoState, id: string): void {
  const goal = state.goals.find((item) => item.id === id);
  if (!goal) fail('Цель не найдена', undefined, 404);
  if (state.goalContributions.some((item) => item.goalId === id)) {
    fail('У цели есть взносы — её можно только архивировать', undefined, 409);
  }
  state.goals = state.goals.filter((item) => item.id !== id);
}

function contributeToGoal(state: DemoState, id: string, amount: number, requestedDate: string | null) {
  const goal = state.goals.find((item) => item.id === id);
  if (!goal) fail('Цель не найдена', undefined, 404);
  if (goal.status === 'archived') fail('Цель в архиве — вносить в неё нельзя', undefined, 422);
  const date = requestedDate ? checkDate(requestedDate) : demoToday();
  if (date > demoToday()) fail('Дата взноса не может быть в будущем', 'date', 422);
  const amountKopValue = amountKop(amount);
  const contributionId = nextId(state, 'goal-part');
  const contribution = {
    id: contributionId, goalId: id, memberId: state.currentUserId, amountKop: amountKopValue, date, createdAt: Date.now(),
  };
  state.goalContributions.push(contribution);
  const accountContribution = {
    id: nextId(state, 'account'), memberId: state.currentUserId, amountKop: amountKopValue, date,
    createdAt: Date.now(), goalContributionId: contributionId,
  };
  state.accountContributions.push(accountContribution);
  if (refreshGoalStatus(state, goal)) {
    notify(state, state.members.map((member) => member.id), 'goal_achieved', `Цель «${goal.title}» накоплена!`,
      'Поздравляем всю семью', { goalId: goal.id }, `goal_achieved:${goal.id}:${goal.achievedAt}`);
  }
  return {
    goal: goalOut(state, goal),
    contribution: {
      id: contribution.id, goalId: contribution.goalId, memberId: contribution.memberId,
      amount: rubles(contribution.amountKop), date: contribution.date, createdAt: contribution.createdAt,
    },
    accountContribution: contributionOut(accountContribution),
  };
}

function listNotifications(state: DemoState) {
  return state.notifications
    .filter((item) => item.memberId === state.currentUserId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50)
    .map(({ id, kind, title, body, data, createdAt, readAt }) => ({ id, kind, title, body, data, createdAt, readAt }));
}

function createImport(state: DemoState, filename: string, content: string): ReturnType<typeof importOut> {
  if (state.imports.filter((item) => item.createdBy === state.currentUserId && item.status === 'pending').length >= 5) {
    fail('Уже 5 неподтверждённых импортов. Подтвердите или удалите их.', undefined, 409);
  }
  const parsed = parseStatement(content);
  const known = new Set(state.expenses.map((expense) => expense.importFingerprint).filter(Boolean));
  const rows = parsed.rows.map((row) => {
    const rule = state.categoryRules[normalize(row.description)];
    return {
      ...row,
      suggestedCategory: rule ?? row.suggestedCategory,
      duplicate: !!row.fingerprint && known.has(row.fingerprint),
    };
  });
  const batch: DemoImport = {
    id: nextId(state, 'import'), status: 'pending', filename: cleanText(filename || 'выписка.csv') || 'выписка.csv',
    createdAt: Date.now(), createdBy: state.currentUserId, totalRows: parsed.totalRows,
    skippedIncome: parsed.skippedIncome, imported: 0, rows,
  };
  state.imports.push(batch);
  return importOut(batch);
}

function createCardImport(state: DemoState, month: string) {
  checkMonth(month, 'month');
  const year = Number(month.slice(0, 4));
  if (year < 2000 || year > 2100) fail('Год должен быть от 2000 до 2100', 'month', 422);
  if (month > demoToday().slice(0, 7)) fail('Нельзя получить покупки за будущий месяц', 'month', 422);
  const filename = `ВТБ-карта-${month}.csv`;
  const latest = [...state.imports]
    .filter((item) => item.createdBy === state.currentUserId && item.filename === filename)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (latest && (latest.status === 'pending' || latest.rows.every((row) => row.duplicate || row.expenseId))) return importOut(latest);
  const result = createImport(state, filename, cardStatement(state.currentUserId, month));
  const batch = state.imports.find((item) => item.id === result.id) as DemoImport;
  if (batch.rows.every((row) => row.duplicate)) batch.status = 'confirmed';
  return importOut(batch);
}

function confirmImport(state: DemoState, id: string, choicesRaw: unknown[]) {
  const batch = state.imports.find((item) => item.id === id && item.createdBy === state.currentUserId);
  if (!batch) fail('Импорт не найден', undefined, 404);
  if (batch.status !== 'pending') fail('Импорт уже подтверждён', undefined, 409);
  const choices = new Map(choicesRaw.filter(isRecord).map((choice) => [stringValue(choice.id), choice]));
  if ([...choices].some(([rowId]) => !batch.rows.some((row) => row.id === rowId))) fail('Строка не из этого импорта', 'rows', 422);
  let imported = 0;
  for (const row of batch.rows) {
    const choice = choices.get(row.id);
    if (row.error || row.duplicate || choice && choice.include === false) continue;
    const category = choice?.category ?? row.suggestedCategory;
    if (!CATEGORIES.includes(category as ExpenseCategory)) fail('Выберите категорию', 'rows', 422);
    const accountMode = choice?.accountMode === 'personal_split' ? 'personal_split' : 'outside';
    const split = accountMode === 'personal_split';
    const expense: DemoExpense = {
      id: nextId(state, 'expense'), title: row.description || 'Операция по карте', amountKop: row.amountKop as number,
      category: category as ExpenseCategory, date: row.date as string, authorId: state.currentUserId,
      paidBy: state.currentUserId, paymentId: null, source: 'personal', splitMode: split ? 'equal' : 'none',
      splitMembers: split ? state.members.map((member) => member.id) : null, splitShares: null,
      accountMode, importFingerprint: row.fingerprint, createdAt: Date.now(),
    };
    state.expenses.push(expense);
    row.expenseId = expense.id;
    imported += 1;
    const key = normalize(row.description);
    if (key && category !== row.suggestedCategory) state.categoryRules[key] = category as ExpenseCategory;
  }
  batch.status = 'confirmed';
  batch.imported = imported;
  refreshDebtReminders(state);
  return importOut(batch);
}

function discardImport(state: DemoState, id: string): void {
  const batch = state.imports.find((item) => item.id === id && item.createdBy === state.currentUserId);
  if (!batch) fail('Импорт не найден', undefined, 404);
  if (batch.status !== 'pending') fail('Подтверждённый импорт удалить нельзя — удалите лишние расходы', undefined, 409);
  state.imports = state.imports.filter((item) => item.id !== id);
}

function importOut(batch: DemoImport, withRows = true) {
  return {
    id: batch.id,
    status: batch.status,
    filename: batch.filename,
    createdAt: batch.createdAt,
    createdBy: batch.createdBy,
    totalRows: batch.totalRows,
    spendingRows: batch.rows.length,
    skippedIncome: batch.skippedIncome,
    duplicates: batch.rows.filter((row) => row.duplicate).length,
    errors: batch.rows.filter((row) => row.error).length,
    imported: batch.imported,
    rows: withRows ? batch.rows.map((row) => ({
      id: row.id, rowNo: row.rowNo, date: row.date,
      amount: row.amountKop === null ? null : rubles(row.amountKop), description: row.description,
      mcc: row.mcc, suggestedCategory: row.suggestedCategory, duplicate: row.duplicate,
      error: row.error, expenseId: row.expenseId,
    })) : null,
  };
}

function parseStatement(content: string): { rows: DemoImportRow[]; totalRows: number; skippedIncome: number } {
  if (new TextEncoder().encode(content).length > 1_048_576) fail('Файл больше 1 МБ', 'content', 422);
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!lines[0]) fail('Файл пустой', 'content', 422);
  const delimiter = [';', ',', '\t'].sort((a, b) => count(lines[0], b) - count(lines[0], a))[0];
  const header = parseCsvLine(lines[0], delimiter).map((value) => value.trim().toLowerCase());
  const variants: Record<string, string[]> = {
    date: ['дата', 'дата операции', 'date'], amount: ['сумма', 'сумма операции', 'amount'],
    description: ['описание', 'назначение', 'описание операции', 'description'], mcc: ['mcc'],
  };
  const indexes = Object.fromEntries(Object.entries(variants).map(([key, names]) => [key, header.findIndex((value) => names.includes(value))]));
  if (indexes.date < 0 || indexes.amount < 0) fail('Не найдены колонки «Дата» и «Сумма»', 'content', 422);
  const seen = new Map<string, number>();
  const rows: DemoImportRow[] = [];
  let totalRows = 0;
  let skippedIncome = 0;
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = parseCsvLine(lines[lineIndex], delimiter);
    if (!cells.some((cell) => cell.trim())) continue;
    totalRows += 1;
    if (totalRows > 1000) fail('Больше 1000 операций — разбейте выписку на части', 'content', 422);
    const rawAmount = cells[indexes.amount] ?? '';
    const parsedAmount = parseAmount(rawAmount);
    if (parsedAmount !== null && parsedAmount > 0) {
      skippedIncome += 1;
      continue;
    }
    const date = parseStatementDate(cells[indexes.date] ?? '');
    const amountKopValue = parsedAmount && parsedAmount < 0 ? -parsedAmount : null;
    const description = cleanText(indexes.description >= 0 ? cells[indexes.description] ?? '' : '');
    const mccRaw = indexes.mcc >= 0 ? (cells[indexes.mcc] ?? '').trim() : '';
    const mcc = /^\d{4}$/.test(mccRaw) ? mccRaw : null;
    const error = !date ? 'Не удалось прочитать дату' : amountKopValue === null ? 'Не удалось прочитать сумму' : null;
    const base = error ? null : `${date}|${amountKopValue}|${normalize(description)}`;
    if (base) seen.set(base, (seen.get(base) ?? 0) + 1);
    const fingerprint = base ? stableHash(`${base}|${seen.get(base)}`) : null;
    rows.push({
      id: `demo-import-row-${lineIndex}-${stableHash(lines[lineIndex]).slice(0, 8)}`, rowNo: lineIndex + 1,
      date, amountKop: amountKopValue, description, mcc, suggestedCategory: suggestCategory(description, mcc),
      duplicate: false, error, expenseId: null, fingerprint,
    });
  }
  return { rows, totalRows, skippedIncome };
}

function cardStatement(memberId: string, month: string): string {
  const merchants: Array<[string, string, [number, number]]> = [
    ['Пятёрочка', '5411', [450, 4200]], ['ВкусВилл', '5411', [600, 5200]], ['Аптека Ригла', '5912', [280, 2600]],
    ['Яндекс Go', '4121', [240, 1800]], ['Кофейня Даблби', '5814', [190, 950]], ['Ozon', '5399', [650, 7500]],
    ['Wildberries', '5399', [500, 6800]], ['АЗС Лукойл', '5541', [1300, 4800]], ['МТС', '4814', [350, 1500]],
    ['Мосметро', '4111', [60, 1200]], ['Детский мир', '5641', [450, 5200]], ['Перекрёсток', '5411', [500, 4800]],
    ['Бургерная', '5812', [350, 1800]],
  ];
  const random = seededRandom(`${memberId}:${month}`);
  const shuffled = [...merchants];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  const countRows = 8 + Math.floor(random() * 6);
  const current = demoToday();
  const lastDay = Math.min(daysInMonth(month), month === current.slice(0, 7) ? Number(current.slice(8, 10)) : 31);
  const rows = ['Дата;Сумма;Описание;MCC'];
  for (let index = 0; index < countRows; index += 1) {
    const [title, mcc, [low, high]] = shuffled[index % shuffled.length];
    const day = 1 + Math.floor(random() * lastDay);
    const kop = low * 100 + Math.floor(random() * ((high - low) * 100 + 1));
    rows.push(`${month}-${String(day).padStart(2, '0')};-${Math.floor(kop / 100)}.${String(kop % 100).padStart(2, '0')};${title};${mcc}`);
  }
  return `${rows.join('\n')}\n`;
}

function validatePaymentMethod(body: Body, amountMode: 'fixed' | 'invoice', method: 'manual' | 'autopay', existing: DemoPayment | null) {
  const existingAmount = existing ? rubles(existing.amountKop) : 0;
  const amountKopValue = amountKop(body.amount ?? existingAmount, 'amount', amountMode === 'invoice');
  if (amountMode === 'fixed' && !amountKopValue) fail('Укажите сумму платежа', 'amount', 422);
  const limit = body.limitAmount === undefined ? existing?.limitAmountKop ?? null
    : body.limitAmount === null ? null : amountKop(body.limitAmount, 'limitAmount');
  if (method === 'autopay') {
    const category = optionalString(body.providerCategory) ?? existing?.providerCategory;
    const catalog = category ? AUTOPAY_CATALOG[category as keyof typeof AUTOPAY_CATALOG] : undefined;
    if (!catalog) fail('Автоплатёж доступен только для категорий из справочника', 'providerCategory', 422);
    const autopayType = optionalString(body.autopayType) ?? existing?.autopayType;
    if (!catalog.autopayTypes.includes(autopayType as never)) {
      fail('Этот тип автоплатежа не поддерживается для выбранной категории', 'autopayType', 422);
    }
    const providerName = (optionalString(body.providerName) ?? existing?.providerName ?? '').trim();
    const providerIdentifier = (optionalString(body.providerIdentifier) ?? existing?.providerIdentifier ?? '').trim();
    if (!providerName) fail('Укажите поставщика', 'providerName', 422);
    if (!providerIdentifier) fail(catalog.identifier.label, 'providerIdentifier', 422);
    if (autopayType === 'by_invoice' && amountMode !== 'invoice') {
      fail('Автоплатёж по счёту требует сумму по выставленному счёту', 'amountMode', 422);
    }
    return {
      amountKop: amountKopValue, details: null, limitAmountKop: limit, autopayType: autopayType as DemoPayment['autopayType'],
      providerCategory: category as DemoPayment['providerCategory'], providerName, providerIdentifier,
    };
  }
  const details = isRecord(body.paymentDetails) ? body.paymentDetails as unknown as PaymentDetails : existing?.paymentDetails ?? null;
  if (details) {
    if (!MANUAL_METHODS.includes(details.method)) fail('Выберите реквизиты: СБП, карта, счёт или УИН', 'paymentDetails', 422);
    if (!details.recipient?.trim()) fail('Укажите получателя', 'paymentDetails', 422);
    const required = details.method === 'sbp_phone' ? ['phone'] : details.method === 'card' ? ['cardNumber']
      : details.method === 'bank_account' ? ['account', 'bic'] : ['uin'];
    if (required.some((field) => !String(details[field as keyof PaymentDetails] ?? '').trim())) {
      fail('Заполните обязательные реквизиты', 'paymentDetails', 422);
    }
    if (!details.purpose?.trim()) fail('Укажите назначение платежа', 'paymentDetails', 422);
  }
  return {
    amountKop: amountKopValue, details, limitAmountKop: limit, autopayType: null,
    providerCategory: null, providerName: null, providerIdentifier: null,
  };
}

function recurrenceRule(body: Body, dueDate: string, existing: DemoPayment | null): RecurrenceRule | null {
  const recurrence = (body.recurrence ?? (existing?.recurring ? existing.recurrence : 'once')) as RecurrenceFrequency;
  if (recurrence === 'once') return null;
  const interval = Number(body.interval ?? existing?.recurrenceRule?.interval ?? 1);
  const unit = body.intervalUnit === undefined ? existing?.recurrenceRule?.unit ?? null : optionalString(body.intervalUnit);
  if (recurrence === 'custom' && !['days', 'weeks', 'months'].includes(unit ?? '')) {
    fail('Для своего периода выберите дни, недели или месяцы', 'intervalUnit', 422);
  }
  const endMode = (body.endMode ?? existing?.recurrenceRule?.endMode ?? 'never') as RecurrenceRule['endMode'];
  const endDate = optionalString(body.endDate) ?? null;
  const occurrences = body.occurrences === null || body.occurrences === undefined ? null : Number(body.occurrences);
  if (endMode === 'date' && (!endDate || checkDate(endDate, 'endDate') < dueDate)) {
    fail('Дата окончания должна быть не раньше первого платежа', 'endDate', 422);
  }
  if (endMode === 'count' && !occurrences) fail('Укажите количество повторов', 'occurrences', 422);
  return { frequency: recurrence as RecurrenceRule['frequency'], interval, unit: recurrence === 'custom' ? unit as RecurrenceRule['unit'] : null, endMode, endDate, occurrences };
}

function splitConfig(state: DemoState, rawMode: unknown, rawMembers: unknown, rawShares: unknown, existing: DemoExpense | DemoPayment | null) {
  const mode = (rawMode ?? existing?.splitMode ?? 'none') as SplitMode;
  const shares = isRecord(rawShares)
    ? Object.fromEntries(Object.entries(rawShares).map(([id, value]) => [id, Number(value)]))
    : rawShares === undefined && existing?.splitMode === mode ? existing.splitShares : null;
  if (mode === 'none') {
    if (shares && Object.keys(shares).length) fail('Для общей траты доли не задаются', 'splitShares', 422);
    return { mode, members: null, shares: null };
  }
  const selected = Array.isArray(rawMembers) ? [...new Set(rawMembers.map(String))]
    : shares ? Object.keys(shares) : existing?.splitMembers ?? state.members.map((member) => member.id);
  const active = new Set(state.members.map((member) => member.id));
  if (!selected.length || selected.some((id) => !active.has(id))) fail('Выберите активных участников семьи', 'splitMembers', 422);
  if (mode === 'equal') {
    if (shares && Object.keys(shares).length) fail('Для деления поровну проценты не задаются', 'splitShares', 422);
    return { mode, members: selected, shares: null };
  }
  if (mode !== 'shares') fail('Деление: none, equal или shares', 'splitMode', 422);
  if (!shares || Object.keys(shares).length !== selected.length
    || Object.keys(shares).some((id) => !selected.includes(id))
    || Object.values(shares).reduce((sum, value) => sum + value, 0) !== 10_000
    || Object.values(shares).some((value) => value <= 0)) {
    fail('Доли выбранных участников должны дать 10 000 базисных пунктов', 'splitShares', 422);
  }
  return { mode, members: selected, shares };
}

function autopayCatalog() {
  return {
    categories: Object.entries(AUTOPAY_CATALOG).map(([key, value]) => ({
      key, ...value, requiredFields: ['providerName', 'providerIdentifier'],
    })),
  };
}

function monthParam(url: URL): string {
  const month = url.searchParams.get('month') ?? '';
  checkMonth(month, 'month');
  return month;
}

function amountKop(value: unknown, field = 'amount', allowZero = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('Введите число, например 1 500 или 1 500,50', field, 422);
  const kop = kopecks(value);
  if (Math.abs(value * 100 - kop) > 1e-6) fail('Не больше двух знаков после запятой', field, 422);
  if (kop < 0) fail('Сумма не может быть отрицательной', field, 422);
  if (kop === 0 && !allowZero) fail('Сумма должна быть больше нуля', field, 422);
  if (kop > 10_000_000_000) fail('Слишком большая сумма', field, 422);
  return kop;
}

function cleanTitle(value: unknown): string {
  const title = stringValue(value).trim();
  if (!title) fail('Укажите название', 'title', 422);
  if (title.length > 120) fail('Название длиннее 120 символов', 'title', 422);
  return title;
}

function checkCategory(value: unknown): ExpenseCategory {
  if (!CATEGORIES.includes(value as ExpenseCategory)) fail('Выберите категорию', 'category', 422);
  return value as ExpenseCategory;
}

function checkMonth(value: string, field = 'monthKey'): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) fail('Месяц в формате ГГГГ-ММ', field, 422);
  return value;
}

function checkDate(value: unknown, field = 'date'): string {
  if (typeof value !== 'string' || !validIsoDate(value)) {
    fail('Укажите дату', field, 422);
  }
  return value;
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function formatMoney(kop: number): string {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rubles(kop));
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function decodeSegment(value: string): string {
  return decodeURIComponent(value);
}

function fail(message: string, field?: string, status = 400): never {
  throw new ApiError(message, field, status);
}

function count(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = '';
    } else current += char;
  }
  cells.push(current);
  return cells;
}

function parseStatementDate(value: string): string | null {
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return validIsoDate(raw) ? raw : null;
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return null;
  const result = `${match[3]}-${match[2]}-${match[1]}`;
  return validIsoDate(result) ? result : null;
}

function parseAmount(value: string): number | null {
  const raw = value.replace(/[\s\u00a0₽]/g, '').replace(',', '.');
  if (!/^[+-]?\d{1,12}(\.\d{1,2})?$/.test(raw)) return null;
  return kopecks(Number(raw));
}

function cleanText(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code >= 127 && code <= 159 ? ' ' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-zа-яё ]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
}

function suggestCategory(description: string, mcc: string | null): ExpenseCategory {
  const mccGroups: Partial<Record<ExpenseCategory, string[]>> = {
    food: ['5411', '5412', '5422', '5441', '5451', '5462', '5499', '5811', '5812', '5814'],
    transport: ['4111', '4112', '4121', '4131', '4784', '5541', '5542', '5983', '7523', '7531', '7538'],
    housing: ['4900', '6513', '1520', '5200', '5211', '5712', '5719'],
    kids: ['5641', '5945', '8211', '8220', '8299', '8351', '7911'],
  };
  if (mcc) for (const [category, values] of Object.entries(mccGroups)) if (values.includes(mcc)) return category as ExpenseCategory;
  const text = description.toLowerCase();
  const keywords: Partial<Record<ExpenseCategory, string[]>> = {
    food: ['пятерочка', 'пятёрочка', 'магнит', 'перекресток', 'перекрёсток', 'вкусвилл', 'ашан', 'лента', 'дикси', 'продукт'],
    transport: ['азс', 'лукойл', 'такси', 'яндекс go', 'метро', 'мосметро', 'парковк', 'ржд'],
    housing: ['жкх', 'жку', 'коммунал', 'мосэнерго', 'аренда', 'квартплат', 'водоканал'],
    kids: ['детский мир', 'школ', 'детский сад', 'кружок', 'секция', 'игрушк'],
  };
  for (const [category, words] of Object.entries(keywords)) if (words.some((word) => text.includes(word))) return category as ExpenseCategory;
  return 'other';
}

function stableHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    first = Math.imul(first ^ value.charCodeAt(index), 0x01000193);
    second = Math.imul(second ^ value.charCodeAt(index), 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function seededRandom(seed: string): () => number {
  let value = Number.parseInt(stableHash(seed).slice(0, 8), 16) || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4_294_967_296;
  };
}

function daysInMonth(month: string): number {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
}
