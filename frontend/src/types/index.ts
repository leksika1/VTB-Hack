/* ── Domain types for the family finance tracker ── */

export type ExpenseCategory = 'food' | 'housing' | 'transport' | 'kids' | 'other';

export interface User {
  id: string;
  name: string;
  color: string;
}

export interface Family {
  id: string;
  name: string;
  inviteCode: string;
  members: User[];
  /** Demo family: persona switching is allowed in the same browser */
  isDemo?: boolean;
}

/** Family plan for one month. A limit, not money that is guaranteed to exist. */
export interface MonthlyBudget {
  familyId: string;
  monthKey: string; // 'YYYY-MM'
  totalAmount: number;
  categoryPlans: Record<ExpenseCategory, number>;
  updatedAt: number;
}

/** An actual spending that already happened. */
export interface Expense {
  id: string;
  familyId: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  date: string; // 'YYYY-MM-DD'
  /** Who created the record. Not the same as who paid. */
  authorId: string | null;
  authorName?: string;
  /** Set when the expense was created by marking a mandatory payment as paid */
  paymentId?: string;
  createdAt: number;
}

export type PaymentStatus = 'upcoming' | 'paid';

/** A future mandatory payment. While upcoming it is reserved; once paid it becomes an expense. */
export interface Payment {
  id: string;
  familyId: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  dueDate: string; // 'YYYY-MM-DD'
  status: PaymentStatus;
  expenseId?: string;
  authorId: string | null;
  createdAt: number;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
  /** Playing the exit animation, removed right after */
  leaving?: boolean;
}

export type Tab = 'overview' | 'operations' | 'plan' | 'family';
