/* ── Domain types for the family finance tracker ── */

export type ExpenseCategory = 'food' | 'housing' | 'transport' | 'kids' | 'other';

export interface User {
  id: string;
  name: string;
  avatarEmoji: string;
  color: string;
}

export interface Family {
  id: string;
  name: string;
  inviteCode: string;
  members: User[];
}

export interface MonthlyBudget {
  monthKey: string; // 'YYYY-MM'
  totalAmount: number;
  categoryPlans: Record<ExpenseCategory, number>;
}

export interface Expense {
  id: string;
  familyId: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  date: string; // 'YYYY-MM-DD'
  authorId: string;
  authorName: string;
  createdAt: number;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}
