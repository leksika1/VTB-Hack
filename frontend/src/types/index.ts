/* ── Domain types for the family finance tracker ── */

export type ExpenseCategory = 'food' | 'housing' | 'transport' | 'kids' | 'other';

/** parent — manages the family money; child — sees only own expenses and pocket money */
export type Role = 'parent' | 'child';

export interface User {
  id: string;
  name: string;
  color: string;
  role?: Role;
}

export interface Family {
  id: string;
  name: string;
  /** Family code (joins as an adult after approval). null for a child and for someone still waiting */
  inviteCode: string | null;
  /** Permanent child code. Only adults see it */
  childInviteCode?: string | null;
  members: User[];
  /** People who joined by code and wait for an adult to let them in. Only adults see them */
  pendingMembers?: User[];
  /** The viewer is waiting for approval: sees only the family name and themselves */
  pending?: boolean;
  /** Demo family: persona switching is allowed in the same browser */
  isDemo?: boolean;
}

/** GET /invites/{code}: what the invited person sees before joining */
export interface InvitePreview {
  code: string;
  familyName: string;
  membersCount: number;
  role: Role;
  /** false — invite link: joins at once; true — family or child code: an adult approves first */
  needsApproval: boolean;
}

/** Invite link (16 characters). The code is returned only once, when the link is created */
export interface InviteLink {
  id: string;
  code: string | null;
  role: Role;
  createdBy: string | null;
  createdAt: number;
  expiresAt: number;
  uses: number;
  lastUsedAt: number | null;
}

/** GET /me */
export interface Me {
  id: string;
  name: string;
  role: Role;
  status?: 'active' | 'pending';
  vtbLinked: boolean;
}

/** Pocket money of a child: a spending limit for a week or a month */
export interface Allowance {
  memberId: string;
  amount: number;
  period: 'week' | 'month';
  periodStart: string;
  periodEnd: string;
  spent: number;
  left: number;
  updatedAt: number;
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
  authorName?: string | null;
  /** Set when the expense was created by marking a mandatory payment as paid */
  paymentId?: string | null;
  /** Who paid; by default the author */
  paidBy?: string | null;
  /** Created from an approved purchase request */
  requestId?: string | null;
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
  expenseId?: string | null;
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
