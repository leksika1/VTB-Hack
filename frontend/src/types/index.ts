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

export type ExpenseSource = 'shared' | 'personal';
export type SplitMode = 'none' | 'equal' | 'shares';

export interface AccountContribution {
  id: string;
  memberId: string | null;
  amount: number;
  date: string;
  createdAt: number;
  topUpSuggestion?: number | null;
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
  source: ExpenseSource;
  splitMode: SplitMode;
  splitMembers: string[] | null;
  /** Доли в базисных пунктах; в сумме дают 10 000. */
  splitShares: Record<string, number> | null;
  /** @deprecated Поле совместимости, которое пока возвращает бэкенд. */
  accountMode?: AccountMode | null;
  /** @deprecated Поле совместимости, которое пока возвращает бэкенд. */
  splitPercentages?: Record<string, number> | null;
  /** Who paid; by default the author */
  paidBy?: string | null;
  createdAt: number;
}

export type PaymentStatus = 'upcoming' | 'paid';
export type AmountMode = 'fixed' | 'invoice';
export type RecurrenceFrequency = 'once' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type RecurrenceUnit = 'days' | 'weeks' | 'months';
export type RecurrenceEndMode = 'never' | 'date' | 'count';
export type PaymentMethod = 'autopay' | 'manual';
export type AutopayType = 'by_invoice' | 'by_date' | 'by_balance';
export type ProviderCategory = 'housing' | 'mobile' | 'internet' | 'traffic_fines';
export type ManualPaymentMethod = 'sbp_phone' | 'card' | 'bank_account' | 'uin';

export interface RecurrenceRule {
  frequency: Exclude<RecurrenceFrequency, 'once'>;
  interval: number;
  unit: RecurrenceUnit | null;
  endMode: RecurrenceEndMode;
  endDate: string | null;
  occurrences: number | null;
}

export interface PaymentDetails {
  recipient: string;
  method: ManualPaymentMethod;
  purpose: string;
  phone?: string;
  cardNumber?: string;
  account?: string;
  bic?: string;
  inn?: string;
  kpp?: string;
  uin?: string;
}

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
  source: ExpenseSource;
  splitMode: SplitMode;
  splitMembers: string[] | null;
  splitShares: Record<string, number> | null;
  amountMode: AmountMode;
  recurrence: RecurrenceFrequency;
  recurrenceRule: RecurrenceRule | null;
  paymentMethod: PaymentMethod;
  autopayType: AutopayType | null;
  providerCategory: ProviderCategory | null;
  providerName: string | null;
  providerIdentifier: string | null;
  limitAmount: number | null;
  paymentDetails: PaymentDetails | null;
  invoiceIssuedAt: number | null;
  /** @deprecated Поле совместимости, которое пока возвращает бэкенд. */
  recurring: boolean;
  seriesId?: string | null;
  /** @deprecated Поле совместимости, которое пока возвращает бэкенд. */
  accountMode?: Exclude<AccountMode, 'personal_split'> | null;
}

export interface AccountMemberSummary {
  memberId: string;
  name: string;
  share: number;
  contributed: number;
  paidPersonally: number;
  due: number;
  topUpSuggestion: number;
  overpaid: number;
  sharePercent: number;
  contributionPercent: number;
  status: 'owes' | 'overpaid' | 'even';
}

export interface AccountSummary {
  monthKey: string;
  balance: number;
  planned: number;
  afterPlanned: number;
  members: AccountMemberSummary[];
  contributions: AccountContribution[];
}

export interface AnalyticsMonth {
  month: string;
  expenses: number;
  accountBalance: number;
  expenseChangePercent: number | null;
}

export interface AnalyticsCategory {
  category: ExpenseCategory;
  amount: number;
  percent: number;
}

export interface Analytics {
  month: string;
  series: AnalyticsMonth[];
  categories: AnalyticsCategory[];
  topCategories: AnalyticsCategory[];
  account: AccountSummary;
  payments: Payment[];
}

export interface CalendarDay {
  date: string;
  expenses: Expense[];
  expenseTotal: number;
  payments: Payment[];
  accountBalance: number;
}

export interface CalendarData {
  month: string;
  days: CalendarDay[];
  upcomingPayments: Payment[];
}

export interface AutopayCatalogCategory {
  key: ProviderCategory;
  name: string;
  autopayTypes: AutopayType[];
  identifier: {
    field: 'providerIdentifier';
    label: string;
  };
  requiredFields: Array<'providerName' | 'providerIdentifier'>;
}

export interface AutopayCatalog {
  categories: AutopayCatalogCategory[];
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
  data: Record<string, unknown>;
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
