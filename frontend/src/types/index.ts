/* ── Domain types for the family finance tracker ── */

export type ExpenseCategory = 'food' | 'housing' | 'transport' | 'kids' | 'other';

/** In v2 every confirmed person is an equal family member. */
export type Role = 'member';

export interface User {
  id: string;
  name: string;
  color: string;
  role?: Role;
  isOwner?: boolean;
  status?: 'active' | 'pending' | 'rejected';
  requestedAt?: number | null;
}

export interface Family {
  id: string;
  name: string;
  ownerId?: string | null;
  isOwner?: boolean;
  /** Family code. null only while the current viewer waits for approval. */
  inviteCode: string | null;
  members: User[];
  /** People who joined by code and wait for the owner. All active members can see them. */
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
  /** In v2 every family code and invite link requires owner approval. */
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
  status?: 'active' | 'pending' | 'rejected';
  vtbLinked: boolean;
  loginId?: string | null;
  isOwner?: boolean;
}

/** Family plan for one month. A limit, not money that is guaranteed to exist. */
export interface MonthlyBudget {
  familyId: string;
  monthKey: string; // 'YYYY-MM'
  totalAmount: number;
  categoryPlans: Record<ExpenseCategory, number>;
  updatedAt: number;
}

export type AccountMode = 'shared_split' | 'shared_common' | 'personal_split' | 'outside';

export interface AccountContribution {
  id: string;
  memberId: string | null;
  amount: number;
  date: string;
  createdAt: number;
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
  accountMode?: AccountMode | null;
  splitMembers?: string[] | null;
  /** Custom allocation of this demo purchase, keyed by member ID. */
  splitPercentages?: Record<string, number> | null;
  /** Who paid; by default the author */
  paidBy?: string | null;
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
  /** Monthly series: the server keeps a payment in this and the next month (docs/FEATURES.md §6) */
  recurring?: boolean;
  seriesId?: string | null;
  accountMode?: Exclude<AccountMode, 'personal_split'> | null;
}

/** Result of «Можем ли купить?» computed by the server for the current month */
export type PurchaseVerdict = 'ok' | 'tight' | 'category-over' | 'not-enough';

export interface ServerPurchaseCheck {
  verdict: PurchaseVerdict;
  amount: number;
  freeBefore: number;
  freeAfter: number;
  categoryLeftAfter: number | null;
}

/** Family savings goal. Contributions are set aside money, not spending: they do not enter the budget (§4) */
export interface Goal {
  id: string;
  familyId: string;
  title: string;
  target: number;
  deadline: string | null; // 'YYYY-MM-DD'
  status: 'active' | 'achieved' | 'archived';
  saved: number;
  left: number;
  /** 0–100, rounded down */
  percent: number;
  /** How much to put aside monthly to make the deadline */
  monthlyNeeded: number | null;
  /** 'YYYY-MM' when the goal is reached at the current pace */
  etaMonth: string | null;
  createdBy: string | null;
  createdAt: number;
  achievedAt: number | null;
}

/** In-app notification about something that happened in the family (docs/FEATURES.md §9) */
export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  createdAt: number;
  readAt: number | null;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
  /** Playing the exit animation, removed right after */
  leaving?: boolean;
}

export type Tab = 'overview' | 'records' | 'analytics' | 'calendar' | 'family';
