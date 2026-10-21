/**
 * Mock server. Until the backend exists, it stores data in localStorage, but behaves like a remote API:
 * requests are async, can fail, check who the user is and what they may do,
 * validate input and ignore duplicate submissions (idempotency key per form).
 *
 * When the backend is ready, replace the bodies of these functions with fetch calls — the UI does not change.
 */
import { budgetKey, useDataStore } from '../store/dataStore';
import { useFamilyStore } from '../store/familyStore';
import { useUIStore } from '../store/uiStore';
import type { Expense, ExpenseCategory, Family, MonthlyBudget, Payment, User } from '../types';
import { ALL_CATEGORIES } from '../utils/categories';
import { MAX_AMOUNT } from '../utils/currency';
import { moveDateToMonth, shiftMonth, todayISO, toMonthKey } from '../utils/date';
import { generateId, generateInviteCode, MEMBER_COLORS } from '../utils/id';

export class ApiError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.field = field;
  }
}

const NETWORK_ERROR = 'Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.';

/** Results of already processed submissions, by idempotency key */
const processed = new Map<string, unknown>();

async function request<T>(handler: () => T, requestId?: string): Promise<T> {
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 250));
  if (useUIStore.getState().simulateErrors) throw new ApiError(NETWORK_ERROR);
  if (requestId && processed.has(requestId)) return processed.get(requestId) as T;
  const result = handler();
  if (requestId) processed.set(requestId, result);
  return result;
}

/* ── Session helpers (what the server would read from the auth token) ── */

function session(): { family: Family; user: User } {
  const { family, currentUserId } = useFamilyStore.getState();
  const user = family?.members.find((m) => m.id === currentUserId);
  if (!family || !user) throw new ApiError('Сессия истекла. Откройте приложение заново.');
  return { family, user };
}

function assertAmount(amount: number, field = 'amount') {
  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError('Сумма должна быть больше нуля', field);
  if (amount > MAX_AMOUNT) throw new ApiError('Слишком большая сумма', field);
}

function assertTitle(title: string) {
  if (!title.trim()) throw new ApiError('Укажите название', 'title');
  if (title.length > 120) throw new ApiError('Название длиннее 120 символов', 'title');
}

function assertDate(iso: string, field = 'date') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new ApiError('Укажите дату', field);
}

/* ── Bootstrap ── */

export function loadInitialData(): Promise<void> {
  return request(() => undefined);
}

/* ── Family ── */

export function createFamily(familyName: string, userName: string, requestId: string): Promise<Family> {
  return request(() => {
    if (!familyName.trim()) throw new ApiError('Укажите название семьи', 'familyName');
    if (!userName.trim()) throw new ApiError('Укажите ваше имя', 'userName');
    const user: User = { id: generateId(), name: userName.trim(), color: MEMBER_COLORS[0] };
    const family: Family = { id: generateId(), name: familyName.trim(), inviteCode: generateInviteCode(), members: [user] };
    useFamilyStore.setState({ family, currentUserId: user.id });
    return family;
  }, requestId);
}

/**
 * Join by invite code. Without a backend another browser cannot look the family up,
 * so the invite link carries the family name as a hint.
 */
export function joinFamily(code: string, familyNameHint: string | null, userName: string, requestId: string): Promise<Family> {
  return request(() => {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(normalized)) throw new ApiError('Код состоит из 6 латинских букв и цифр', 'code');
    if (!userName.trim()) throw new ApiError('Укажите ваше имя', 'userName');
    const existing = useFamilyStore.getState().family;
    const base: Family =
      existing && existing.inviteCode === normalized
        ? existing
        : { id: `family-${normalized}`, name: familyNameHint?.trim() || 'Семья', inviteCode: normalized, members: [] };
    const user: User = {
      id: generateId(),
      name: userName.trim(),
      color: MEMBER_COLORS[base.members.length % MEMBER_COLORS.length],
    };
    const family: Family = { ...base, members: [...base.members, user] };
    useFamilyStore.setState({ family, currentUserId: user.id });
    return family;
  }, requestId);
}

export function leaveFamily(): Promise<void> {
  return request(() => {
    useFamilyStore.setState({ family: null, currentUserId: null });
  });
}

/** Demo only: act as another member of the demo family in the same browser */
export function switchDemoUser(userId: string): Promise<void> {
  return request(() => {
    const { family } = session();
    if (!family.isDemo) throw new ApiError('Переключение участников доступно только в демо-режиме');
    if (!family.members.some((m) => m.id === userId)) throw new ApiError('Участник не найден');
    useFamilyStore.setState({ currentUserId: userId });
  });
}

/* ── Budget ── */

export interface BudgetInput {
  monthKey: string;
  totalAmount: number;
  categoryPlans: Record<ExpenseCategory, number>;
}

export function saveBudget(input: BudgetInput, requestId: string): Promise<MonthlyBudget> {
  return request(() => {
    const { family } = session();
    assertAmount(input.totalAmount, 'total');
    let sum = 0;
    for (const k of ALL_CATEGORIES) {
      const v = input.categoryPlans[k] || 0;
      if (v < 0) throw new ApiError('Лимит не может быть отрицательным', k);
      sum += v;
    }
    if (sum > input.totalAmount + 0.001) throw new ApiError('Сумма лимитов больше общего бюджета', 'total');
    const budget: MonthlyBudget = {
      familyId: family.id,
      monthKey: input.monthKey,
      totalAmount: input.totalAmount,
      categoryPlans: { ...input.categoryPlans },
      updatedAt: Date.now(),
    };
    useDataStore.setState((s) => ({ budgets: { ...s.budgets, [budgetKey(family.id, input.monthKey)]: budget } }));
    return budget;
  }, requestId);
}

/* ── Expenses ── */

export interface ExpenseInput {
  id?: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
}

export function saveExpense(input: ExpenseInput, requestId: string): Promise<Expense> {
  return request(() => {
    const { family, user } = session();
    assertTitle(input.title);
    assertAmount(input.amount);
    assertDate(input.date);

    const { expenses } = useDataStore.getState();
    if (input.id) {
      const current = expenses.find((e) => e.id === input.id && e.familyId === family.id);
      if (!current) throw new ApiError('Расход не найден — возможно, его уже удалили');
      if (current.authorId !== user.id) throw new ApiError('Изменять можно только свои расходы');
      const updated: Expense = { ...current, title: input.title.trim(), amount: input.amount, category: input.category, date: input.date };
      useDataStore.setState((s) => ({ expenses: s.expenses.map((e) => (e.id === updated.id ? updated : e)) }));
      return updated;
    }
    const expense: Expense = {
      id: generateId(),
      familyId: family.id,
      title: input.title.trim(),
      amount: input.amount,
      category: input.category,
      date: input.date,
      authorId: user.id,
      authorName: user.name,
      createdAt: Date.now(),
    };
    useDataStore.setState((s) => ({ expenses: [expense, ...s.expenses] }));
    return expense;
  }, requestId);
}

export function deleteExpense(id: string): Promise<void> {
  return request(() => {
    const { family, user } = session();
    const expense = useDataStore.getState().expenses.find((e) => e.id === id && e.familyId === family.id);
    if (!expense) return;
    if (expense.authorId !== user.id) throw new ApiError('Удалять можно только свои расходы');
    useDataStore.setState((s) => ({
      expenses: s.expenses.filter((e) => e.id !== id),
      // An expense created from a payment: the payment goes back to «Предстоит»
      payments: expense.paymentId
        ? s.payments.map((p) => (p.id === expense.paymentId ? { ...p, status: 'upcoming', expenseId: undefined } : p))
        : s.payments,
    }));
  });
}

/* ── Mandatory payments ── */

export interface PaymentInput {
  id?: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  dueDate: string;
}

export function savePayment(input: PaymentInput, requestId: string): Promise<Payment> {
  return request(() => {
    const { family, user } = session();
    assertTitle(input.title);
    assertAmount(input.amount);
    assertDate(input.dueDate, 'dueDate');

    const { payments } = useDataStore.getState();
    if (input.id) {
      const current = payments.find((p) => p.id === input.id && p.familyId === family.id);
      if (!current) throw new ApiError('Платёж не найден — возможно, его уже удалили');
      if (current.status === 'paid') throw new ApiError('Платёж уже оплачен. Сначала верните его в предстоящие.');
      const updated: Payment = { ...current, title: input.title.trim(), amount: input.amount, category: input.category, dueDate: input.dueDate };
      useDataStore.setState((s) => ({ payments: s.payments.map((p) => (p.id === updated.id ? updated : p)) }));
      return updated;
    }
    const payment: Payment = {
      id: generateId(),
      familyId: family.id,
      title: input.title.trim(),
      amount: input.amount,
      category: input.category,
      dueDate: input.dueDate,
      status: 'upcoming',
      authorId: user.id,
      createdAt: Date.now(),
    };
    useDataStore.setState((s) => ({ payments: [...s.payments, payment] }));
    return payment;
  }, requestId);
}

export function deletePayment(id: string): Promise<void> {
  return request(() => {
    const { family } = session();
    const payment = useDataStore.getState().payments.find((p) => p.id === id && p.familyId === family.id);
    if (!payment) return;
    if (payment.status === 'paid') throw new ApiError('Платёж уже оплачен. Сначала верните его в предстоящие.');
    useDataStore.setState((s) => ({ payments: s.payments.filter((p) => p.id !== id) }));
  });
}

/**
 * Paid → the payment stops being a reserve and becomes an actual expense (counted once).
 * Unpaid → the linked expense is removed and the amount is reserved again.
 */
export function setPaymentPaid(id: string, paid: boolean): Promise<Expense | null> {
  return request(() => {
    const { family, user } = session();
    const payment = useDataStore.getState().payments.find((p) => p.id === id && p.familyId === family.id);
    if (!payment) throw new ApiError('Платёж не найден');

    if (paid) {
      if (payment.status === 'paid') return null;
      const today = todayISO();
      const date = payment.dueDate.slice(0, 7) === toMonthKey() ? today : payment.dueDate;
      const expense: Expense = {
        id: generateId(),
        familyId: family.id,
        title: payment.title,
        amount: payment.amount,
        category: payment.category,
        date,
        authorId: user.id,
        authorName: user.name,
        paymentId: payment.id,
        createdAt: Date.now(),
      };
      useDataStore.setState((s) => ({
        expenses: [expense, ...s.expenses],
        payments: s.payments.map((p) => (p.id === id ? { ...p, status: 'paid', expenseId: expense.id } : p)),
      }));
      return expense;
    }

    if (payment.status === 'upcoming') return null;
    useDataStore.setState((s) => ({
      expenses: s.expenses.filter((e) => e.id !== payment.expenseId),
      payments: s.payments.map((p) => (p.id === id ? { ...p, status: 'upcoming', expenseId: undefined } : p)),
    }));
    return null;
  });
}

/** Copy all payments of the previous month into this one as upcoming. Returns how many were added. */
export function copyPaymentsFromPreviousMonth(monthKey: string): Promise<number> {
  return request(() => {
    const { family, user } = session();
    const prev = shiftMonth(monthKey, -1);
    const { payments } = useDataStore.getState();
    const existingTitles = new Set(
      payments.filter((p) => p.familyId === family.id && p.dueDate.startsWith(monthKey)).map((p) => p.title)
    );
    const copies: Payment[] = payments
      .filter((p) => p.familyId === family.id && p.dueDate.startsWith(prev) && !existingTitles.has(p.title))
      .map((p) => ({
        id: generateId(),
        familyId: family.id,
        title: p.title,
        amount: p.amount,
        category: p.category,
        dueDate: moveDateToMonth(p.dueDate, monthKey),
        status: 'upcoming',
        authorId: user.id,
        createdAt: Date.now(),
      }));
    useDataStore.setState((s) => ({ payments: [...s.payments, ...copies] }));
    return copies.length;
  });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}
