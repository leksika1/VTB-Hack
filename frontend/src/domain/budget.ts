/**
 * The single source of truth for every financial number in the UI.
 *
 * Rules:
 *  - «Потрачено»       = sum of actual expenses dated in the month.
 *  - «Зарезервировано» = sum of mandatory payments of the month that are still upcoming.
 *    A paid payment is NOT reserved any more: it became an expense, so it is counted once, in «Потрачено».
 *  - «Осталось по плану» = plan − spent.
 *  - «Свободно по плану» = plan − spent − reserved. This is what can be spent on something new.
 */
import type { Expense, ExpenseCategory, MonthlyBudget, Payment } from '../types';
import { ALL_CATEGORIES, emptyCategoryRecord } from '../utils/categories';
import { daysFromToday } from '../utils/date';

/** Share of the limit after which a category is «почти исчерпан» */
export const NEAR_LIMIT_SHARE = 0.85;

export type CategoryStatus = 'no-limit' | 'no-spend' | 'ok' | 'near' | 'over';

export interface CategorySummary {
  key: ExpenseCategory;
  plan: number;
  spent: number;
  reserved: number;
  /** plan − spent − reserved; negative means the limit is exceeded (now or after upcoming payments) */
  left: number;
  status: CategoryStatus;
  /** true when the limit is already exceeded by actual expenses, not only by reserved payments */
  overByExpenses: boolean;
}

export interface MonthSummary {
  hasBudget: boolean;
  plan: number;
  spent: number;
  reserved: number;
  leftByPlan: number;
  freeByPlan: number;
  /** total plan − sum of category limits */
  unallocated: number;
  categories: CategorySummary[];
  upcomingPayments: Payment[];
  paidPayments: Payment[];
  expenses: Expense[];
}

export function sortExpensesNewestFirst(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

export function sortPaymentsByDue(payments: Payment[]): Payment[] {
  return [...payments].sort((a, b) => (a.dueDate === b.dueDate ? a.createdAt - b.createdAt : a.dueDate < b.dueDate ? -1 : 1));
}

export function isOverdue(payment: Payment): boolean {
  return payment.status === 'upcoming' && daysFromToday(payment.dueDate) < 0;
}

export function categoryStatus(plan: number, spent: number, reserved: number): CategoryStatus {
  const used = spent + reserved;
  if (plan <= 0) return 'no-limit';
  if (used === 0) return 'no-spend';
  if (used > plan) return 'over';
  if (used >= plan * NEAR_LIMIT_SHARE) return 'near';
  return 'ok';
}

export function computeMonthSummary(
  budget: MonthlyBudget | null,
  allExpenses: Expense[],
  allPayments: Payment[],
  familyId: string,
  monthKey: string
): MonthSummary {
  const expenses = sortExpensesNewestFirst(
    allExpenses.filter((e) => e.familyId === familyId && e.date.startsWith(monthKey))
  );
  const monthPayments = sortPaymentsByDue(
    allPayments.filter((p) => p.familyId === familyId && p.dueDate.startsWith(monthKey))
  );
  const upcomingPayments = monthPayments.filter((p) => p.status === 'upcoming');
  const paidPayments = monthPayments.filter((p) => p.status === 'paid');

  const spentBy = emptyCategoryRecord();
  for (const e of expenses) spentBy[e.category] += e.amount;
  const reservedBy = emptyCategoryRecord();
  for (const p of upcomingPayments) reservedBy[p.category] += p.amount;

  const plans = budget?.categoryPlans ?? emptyCategoryRecord();
  const categories: CategorySummary[] = ALL_CATEGORIES.map((key) => {
    const plan = plans[key] || 0;
    const spent = round(spentBy[key]);
    const reserved = round(reservedBy[key]);
    return {
      key,
      plan,
      spent,
      reserved,
      left: round(plan - spent - reserved),
      status: categoryStatus(plan, spent, reserved),
      overByExpenses: plan > 0 && spent > plan,
    };
  });

  const plan = budget?.totalAmount ?? 0;
  const spent = round(categories.reduce((s, c) => s + c.spent, 0));
  const reserved = round(categories.reduce((s, c) => s + c.reserved, 0));
  const allocated = ALL_CATEGORIES.reduce((s, k) => s + (plans[k] || 0), 0);

  return {
    hasBudget: !!budget,
    plan,
    spent,
    reserved,
    leftByPlan: round(plan - spent),
    freeByPlan: round(plan - spent - reserved),
    unallocated: round(plan - allocated),
    categories,
    upcomingPayments,
    paidPayments,
    expenses,
  };
}

/** Categories the user should look at: exceeded first, then nearly exhausted */
export function problemCategories(summary: MonthSummary): CategorySummary[] {
  const rank: Partial<Record<CategoryStatus, number>> = { over: 0, near: 1 };
  return summary.categories
    .filter((c) => c.status === 'over' || c.status === 'near' || (c.status === 'no-limit' && c.spent + c.reserved > 0 && summary.hasBudget))
    .sort((a, b) => (rank[a.status] ?? 2) - (rank[b.status] ?? 2) || a.left - b.left);
}

/** Categories whose limit does not cover expenses and upcoming payments, the largest gap first */
export function categoryShortages(summary: MonthSummary): CategorySummary[] {
  if (!summary.hasBudget) return [];
  return summary.categories.filter((c) => c.status === 'over').sort((a, b) => a.left - b.left);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
