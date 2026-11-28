import type {
  AccountMode,
  AmountMode,
  AutopayType,
  ExpenseCategory,
  ExpenseSource,
  PaymentDetails,
  PaymentMethod,
  PaymentStatus,
  ProviderCategory,
  RecurrenceFrequency,
  RecurrenceRule,
  SplitMode,
  User,
} from '../types';

export const LOCAL_DEMO_TOKEN = 'local-demo';
export const LOCAL_DEMO_STORAGE_KEY = 'fb-local-demo-v1';
export const LOCAL_DEMO_SCHEMA = 1;

export interface DemoBudget {
  monthKey: string;
  totalKop: number;
  categoryPlansKop: Record<ExpenseCategory, number>;
  updatedAt: number;
}

export interface DemoExpense {
  id: string;
  title: string;
  amountKop: number;
  category: ExpenseCategory;
  date: string;
  authorId: string | null;
  paidBy: string | null;
  paymentId: string | null;
  source: ExpenseSource;
  splitMode: SplitMode;
  splitMembers: string[] | null;
  splitShares: Record<string, number> | null;
  accountMode: AccountMode | null;
  importFingerprint?: string | null;
  createdAt: number;
}

export interface DemoPayment {
  id: string;
  title: string;
  amountKop: number;
  category: ExpenseCategory;
  dueDate: string;
  status: PaymentStatus;
  expenseId: string | null;
  authorId: string | null;
  createdAt: number;
  source: ExpenseSource;
  splitMode: SplitMode;
  splitMembers: string[] | null;
  splitShares: Record<string, number> | null;
  accountMode: Exclude<AccountMode, 'personal_split'> | null;
  amountMode: AmountMode;
  recurrence: RecurrenceFrequency;
  recurrenceRule: RecurrenceRule | null;
  recurring: boolean;
  seriesId: string | null;
  seriesSequence: number | null;
  seriesMonth: string | null;
  paymentMethod: PaymentMethod;
  autopayType: AutopayType | null;
  providerCategory: ProviderCategory | null;
  providerName: string | null;
  providerIdentifier: string | null;
  limitAmountKop: number | null;
  paymentDetails: PaymentDetails | null;
  invoiceIssuedAt: number | null;
}

export interface DemoAccountContribution {
  id: string;
  memberId: string | null;
  amountKop: number;
  date: string;
  createdAt: number;
  goalContributionId?: string | null;
}

export interface DemoGoal {
  id: string;
  title: string;
  targetKop: number;
  deadline: string | null;
  status: 'active' | 'achieved' | 'archived';
  createdBy: string | null;
  createdAt: number;
  achievedAt: number | null;
}

export interface DemoGoalContribution {
  id: string;
  goalId: string;
  memberId: string | null;
  amountKop: number;
  date: string;
  createdAt: number;
}

export interface DemoNotification {
  id: string;
  memberId: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  dedupeKey: string;
  createdAt: number;
  readAt: number | null;
}

export interface DemoImportRow {
  id: string;
  rowNo: number;
  date: string | null;
  amountKop: number | null;
  description: string;
  mcc: string | null;
  suggestedCategory: ExpenseCategory;
  duplicate: boolean;
  error: string | null;
  expenseId: string | null;
  fingerprint: string | null;
}

export interface DemoImport {
  id: string;
  status: 'pending' | 'confirmed';
  filename: string;
  createdAt: number;
  createdBy: string;
  totalRows: number;
  skippedIncome: number;
  imported: number;
  rows: DemoImportRow[];
}

export interface DemoState {
  schema: typeof LOCAL_DEMO_SCHEMA;
  familyId: string;
  familyName: string;
  inviteCode: string;
  ownerId: string;
  currentUserId: string;
  members: User[];
  pendingMembers: User[];
  budgets: DemoBudget[];
  expenses: DemoExpense[];
  payments: DemoPayment[];
  accountContributions: DemoAccountContribution[];
  goals: DemoGoal[];
  goalContributions: DemoGoalContribution[];
  notifications: DemoNotification[];
  imports: DemoImport[];
  categoryRules: Record<string, ExpenseCategory>;
  preferences: Record<string, {
    debtReminderThresholdKop: number;
    defaultSplit: 'equal' | 'none' | 'ask';
    calendarEnabled: boolean;
  }>;
  sequence: number;
}

export type DemoMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface DemoSession {
  token: typeof LOCAL_DEMO_TOKEN;
  currentUserId: string;
  family: import('../types').Family;
}
