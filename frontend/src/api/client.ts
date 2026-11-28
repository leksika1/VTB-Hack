/**
 * Client of the backend API (backend/app/api, docs/ARCHITECTURE.md).
 * Every write goes to the server; the answer is applied to the local stores so screens update at once.
 * The server owns permissions, validation and idempotency (Idempotency-Key = the form's requestId).
 */
import { budgetKey, useDataStore } from '../store/dataStore';
import { useFamilyStore } from '../store/familyStore';
import { useUIStore } from '../store/uiStore';
import type {
  AccountContribution,
  AccountSummary,
  AmountMode,
  Analytics,
  AppNotification,
  AutopayCatalog,
  AutopayType,
  CalendarData,
  Expense,
  ExpenseCategory,
  ExpenseSource,
  Family,
  Goal,
  InviteLink,
  InvitePreview,
  Me,
  MonthlyBudget,
  Payment,
  PaymentDetails,
  PaymentMethod,
  ProviderCategory,
  RecurrenceEndMode,
  RecurrenceFrequency,
  RecurrenceUnit,
  Role,
  SplitMode,
} from '../types';

export class ApiError extends Error {
  readonly field?: string;
  readonly status?: number;
  constructor(message: string, field?: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.field = field;
    this.status = status;
  }
}

/** Ошибка 409 от «Оплатить сейчас» с доступной интерфейсу суммой нехватки. */
export class SharedAccountShortageError extends ApiError {
  readonly shortage: number;

  constructor(shortage: number) {
    const formatted = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(shortage);
    super(`На общем счёте не хватает ${formatted} ₽`, undefined, 409);
    this.name = 'SharedAccountShortageError';
    this.shortage = shortage;
  }
}

const NETWORK_ERROR = 'Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.';
const SESSION_EXPIRED = 'Сессия истекла. Откройте приложение заново.';

/** Empty — same origin: /api is proxied by vite in dev and by nginx in the container */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const dataChangeListeners = new Set<() => void>();

/** Рассылает хукам события существующего realtime-соединения и успешных изменений. */
export function subscribeToDataChanges(listener: () => void): () => void {
  dataChangeListeners.add(listener);
  return () => dataChangeListeners.delete(listener);
}

function notifyDataChanged() {
  for (const listener of dataChangeListeners) listener();
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  requestId?: string;
  /** Requests made before there is a session (create, join, demo) */
  anonymous?: boolean;
}

async function request<T>(path: string, { method = 'GET', body, requestId, anonymous }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (requestId) headers['Idempotency-Key'] = requestId;
  if (!anonymous) {
    const token = useFamilyStore.getState().token;
    if (!token) throw new ApiError(SESSION_EXPIRED, undefined, 401);
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(NETWORK_ERROR);
  }

  if (response.status === 204) {
    if (method !== 'GET') notifyDataChanged();
    return undefined as T;
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !anonymous) clearSession();
    const error = data?.error;
    if (error?.message) throw new ApiError(error.message, error.field ?? undefined, response.status);
    throw new ApiError(response.status >= 500 ? 'Сервер временно недоступен. Попробуйте ещё раз.' : NETWORK_ERROR);
  }
  if (method !== 'GET') notifyDataChanged();
  return data as T;
}

/* ── Session ── */

interface SessionResponse {
  token: string;
  currentUserId: string;
  family: Family;
  loginId?: string | null;
}

interface StateResponse {
  accountContributions?: AccountContribution[];
  family: Family;
  currentUserId: string;
  budgets: MonthlyBudget[];
  expenses: Expense[];
  payments: Payment[];
}

function clearSession() {
  const { family, savedSession } = useFamilyStore.getState();
  useDataStore.setState({ budgets: {}, expenses: [], payments: [], goals: [], accountContributions: [] });
  // The demo copy was left or has expired: back to the real account that was open before it
  if (family?.isDemo && savedSession) {
    useFamilyStore.setState({ ...savedSession, savedSession: null });
    refreshData().catch(() => {});
    return;
  }
  useFamilyStore.setState({ family: null, currentUserId: null, token: null, savedSession: null });
}

function applyState(state: StateResponse) {
  useFamilyStore.setState({ family: state.family, currentUserId: state.currentUserId });
  useDataStore.setState({
    budgets: Object.fromEntries(state.budgets.map((b) => [budgetKey(b.familyId, b.monthKey), b])),
    expenses: state.expenses,
    payments: state.payments,
    accountContributions: state.accountContributions ?? [],
  });
}

/** Pending members can read /state only. */
async function loadState(): Promise<void> {
  const { token } = useFamilyStore.getState();
  const state = await request<StateResponse>('/state');
  const goals = state.family.pending ? [] : await request<Goal[]>('/goals');
  if (useFamilyStore.getState().token !== token) return;
  applyState(state);
  useDataStore.setState({ goals });
}

async function startSession(session: SessionResponse): Promise<Family> {
  useFamilyStore.setState({ token: session.token, family: session.family, currentUserId: session.currentUserId });
  await loadState();
  if (session.loginId) useUIStore.getState().addToast(`Сохраните личный ID для входа: ${session.loginId}`, 'info');
  return session.family;
}

/* ── Bootstrap ── */

/** Loads everything of the family. Without a session there is nothing to load — onboarding is shown. */
export async function loadInitialData(): Promise<void> {
  if (!useFamilyStore.getState().token) {
    clearSession();
    return;
  }
  try {
    await loadState();
  } catch (e) {
    // The session is gone (member left, family deleted) — back to onboarding instead of an error screen
    if (e instanceof ApiError && e.status === 401) return;
    throw e;
  }
}

/** Silent refresh to pick up changes made by other family members */
export async function refreshData(): Promise<void> {
  if (!useFamilyStore.getState().token) return;
  await loadState();
}

/**
 * Live updates: GET /api/events (Server-Sent Events) says «family data changed», then we reload /state.
 * EventSource cannot send the Authorization header, so the stream is read with fetch.
 * Reconnects with a growing delay; after every (re)connect the state is reloaded to catch missed events.
 * Returns a function that stops the subscription.
 */
export function subscribeToChanges(onChange: () => void): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let retryDelay = 1000;

  const connect = async () => {
    while (!stopped) {
      const token = useFamilyStore.getState().token;
      if (!token) return;
      controller = new AbortController();
      try {
        const response = await fetch(`${API_BASE}/api/events`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (response.status === 401) {
          clearSession();
          return;
        }
        if (!response.ok || !response.body) throw new Error(`events: ${response.status}`);
        retryDelay = 1000;
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const messages = buffer.split('\n\n');
          buffer = messages.pop() ?? '';
          // «ready» after a reconnect and «changed» both mean: reload the state
          if (messages.some((m) => /^event: (changed|ready)$/m.test(m))) {
            notifyDataChanged();
            onChange();
          }
        }
      } catch {
        if (stopped) return;
      }
      await new Promise((r) => setTimeout(r, retryDelay));
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  };

  connect();
  return () => {
    stopped = true;
    controller?.abort();
  };
}

/* ── Family ── */

export async function createFamily(familyName: string, userName: string, requestId: string): Promise<Family> {
  const session = await withLinkToken((oidcLinkToken) =>
    request<SessionResponse>('/families', {
      method: 'POST',
      body: { familyName, userName, oidcLinkToken },
      requestId,
      anonymous: true,
    })
  );
  return startSession(session);
}

export async function loginById(loginId: string): Promise<Family> {
  const session = await request<SessionResponse>('/auth/login', {
    method: 'POST', body: { loginId: loginId.trim().toUpperCase() }, anonymous: true,
  });
  return startSession(session);
}

/** What the invited person sees before joining: family name, members and owner-approval requirement. */
export async function getInvitePreview(code: string): Promise<InvitePreview> {
  const normalized = normalizeInviteCode(code);
  return request<InvitePreview>(`/invites/${normalized}`, { anonymous: true });
}

function normalizeInviteCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  // 6 characters: family code; 16: invite link. Both require owner approval.
  if (!/^[A-Z0-9]{6}([A-Z0-9]{10})?$/.test(normalized)) {
    throw new ApiError('Код — 6 латинских букв и цифр, код из ссылки — 16', 'code');
  }
  return normalized;
}

/** Join by a family code or invite link. The new member always waits for owner approval. */
export async function joinFamily(code: string, userName: string, requestId: string): Promise<Family> {
  const normalized = normalizeInviteCode(code);
  const session = await withLinkToken((oidcLinkToken) =>
    request<SessionResponse>(`/invites/${normalized}/join`, {
      method: 'POST',
      body: { userName, oidcLinkToken },
      requestId,
      anonymous: true,
    })
  );
  return startSession(session);
}

/**
 * A personal copy of the demo family on the server — a sandbox: nobody can join it, VTB ID and e-mail are not
 * attached to it. The real account that was open is kept aside and comes back when the demo is left.
 */
export async function startDemo(): Promise<Family> {
  const session = await request<SessionResponse>('/demo', { method: 'POST', anonymous: true });
  const { token, family, currentUserId } = useFamilyStore.getState();
  if (token && family && !family.isDemo) useFamilyStore.setState({ savedSession: { token, family, currentUserId } });
  return startSession(session);
}

/** Close the demo copy: the server ends its sessions (real families are untouched), the real account returns */
export async function exitDemo(): Promise<void> {
  const demoToken = useFamilyStore.getState().token;
  try {
    await request<void>('/family/leave', { method: 'POST' });
  } catch {
    /* the copy may be gone already — leave it anyway */
  }
  // A 401 above has already switched back to the real account
  if (useFamilyStore.getState().token === demoToken) clearSession();
}

export async function leaveFamily(): Promise<void> {
  if (useFamilyStore.getState().family?.isDemo) return exitDemo();
  await request<void>('/family/leave', { method: 'POST' });
  clearSession();
}

/** End the session on this device without removing the participant from the family. */
export async function signOut(): Promise<void> {
  if (useFamilyStore.getState().family?.isDemo) return exitDemo();
  clearSession();
}

/** Demo only: act as another member of the demo family */
export async function switchDemoUser(userId: string): Promise<void> {
  const session = await request<SessionResponse>('/family/switch-user', { method: 'POST', body: { userId } });
  await startSession(session);
}

/** Re-read the family: used while waiting for approval */
export async function reloadState(): Promise<void> {
  await loadState();
}

/* ── Members and invites ── */

/** Invite link: whoever opens it creates a request for the owner. The code is shown only now. */
export async function createInviteLink(role: Role): Promise<InviteLink> {
  return request<InviteLink>('/family/invite-links', { method: 'POST', body: { role } });
}

export async function approveMember(memberId: string): Promise<void> {
  const family = await request<Family>(`/family/members/${memberId}/approve`, { method: 'POST' });
  useFamilyStore.setState({ family });
}

export async function rejectMember(memberId: string): Promise<void> {
  await request<void>(`/family/members/${memberId}/reject`, { method: 'POST' });
  useFamilyStore.setState((s) => s.family ? {
    family: { ...s.family, pendingMembers: s.family.pendingMembers?.filter((m) => m.id !== memberId) },
  } : s);
}

/** Decline a join request (or remove a member) */
export async function removeMember(memberId: string): Promise<void> {
  await request<void>(`/family/members/${memberId}`, { method: 'DELETE' });
  useFamilyStore.setState((s) =>
    s.family
      ? {
          family: {
            ...s.family,
            members: s.family.members.filter((m) => m.id !== memberId),
            pendingMembers: s.family.pendingMembers?.filter((m) => m.id !== memberId),
          },
        }
      : s
  );
}

/* ── VTB ID (OpenID Connect, docs/FEATURES.md §11) ── */

export interface OidcConfig {
  enabled: boolean;
  providerName: string;
}

type OidcCallbackResponse =
  | { status: 'session'; session: SessionResponse; linkToken: null }
  | { status: 'unlinked'; session: null; linkToken: string }
  | { status: 'linked'; session: null; linkToken: null };

/** The page the bank returns to. It must be listed in OIDC_REDIRECT_URIS on the backend */
export const OIDC_CALLBACK_PATH = '/auth/callback';
const LINK_TOKEN_KEY = 'fb-oidc-link';
/** linkToken lives 10 minutes on the server */
const LINK_TOKEN_TTL_MS = 10 * 60_000;
const RETURN_INVITE_KEY = 'fb-oidc-invite';
const INTENT_KEY = 'fb-oidc-intent';
/** Set while an automatic restart after a stale state is under way: a second stale state in a row is shown as an error */
const RESTART_KEY = 'fb-oidc-restarted';

let oidcConfig: Promise<OidcConfig> | null = null;

/** Whether «Войти через ВТБ ID» is available. Cached: the setting does not change while the page is open */
export function getOidcConfig(): Promise<OidcConfig> {
  oidcConfig ??= request<OidcConfig>('/auth/oidc/config', { anonymous: true }).catch(() => {
    oidcConfig = null;
    return { enabled: false, providerName: 'ВТБ ID' };
  });
  return oidcConfig;
}

/**
 * Go to the bank. login — sign in (or get a linkToken for a new member); link — attach VTB ID to the current member.
 * An invite that was open is remembered, so after the bank the person lands on the same invite.
 */
export async function startOidc(intent: 'login' | 'link', inviteCode?: string | null): Promise<void> {
  const { authorizationUrl } = await request<{ authorizationUrl: string }>('/auth/oidc/start', {
    method: 'POST',
    body: { intent, redirectUri: `${window.location.origin}${OIDC_CALLBACK_PATH}` },
    anonymous: intent === 'login',
  });
  try {
    if (inviteCode) sessionStorage.setItem(RETURN_INVITE_KEY, inviteCode);
    else sessionStorage.removeItem(RETURN_INVITE_KEY);
    sessionStorage.setItem(INTENT_KEY, intent);
  } catch {
    /* storage is unavailable — the invite will have to be opened again */
  }
  window.location.assign(authorizationUrl);
}

/** Invite code that was open before going to the bank (read once) */
export function takeReturnInvite(): string | null {
  try {
    const code = sessionStorage.getItem(RETURN_INVITE_KEY);
    sessionStorage.removeItem(RETURN_INVITE_KEY);
    return code;
  } catch {
    return null;
  }
}

/** Why the bank was opened: a cancelled link returns to the «Семья» tab it was started from (read once) */
export function takeOidcIntent(): 'login' | 'link' {
  try {
    const intent = sessionStorage.getItem(INTENT_KEY);
    sessionStorage.removeItem(INTENT_KEY);
    sessionStorage.removeItem(RESTART_KEY); // the sign-in is over one way or another: the next stale state may restart again
    return intent === 'link' ? 'link' : 'login';
  } catch {
    return 'login';
  }
}

/** The callback was rejected because its state was already used or expired (back button, a second tab, >10 min) */
export function isStaleOidcState(e: unknown): boolean {
  return e instanceof ApiError && e.field === 'state';
}

/**
 * Open the bank again with a fresh state and the same intent and invite as before. Once in a row:
 * returns false (and resets the guard) when the previous callback was already a restart, so the caller shows the error.
 * Throws when the bank cannot be opened (e.g. link without a session).
 */
export async function restartOidc(): Promise<boolean> {
  let intent: 'login' | 'link' = 'login';
  let invite: string | null = null;
  try {
    if (sessionStorage.getItem(RESTART_KEY)) {
      sessionStorage.removeItem(RESTART_KEY);
      return false;
    }
    intent = sessionStorage.getItem(INTENT_KEY) === 'link' ? 'link' : 'login';
    invite = sessionStorage.getItem(RETURN_INVITE_KEY);
    sessionStorage.setItem(RESTART_KEY, '1');
  } catch {
    return false; // without storage the loop guard does not work — do not restart at all
  }
  try {
    await startOidc(intent, invite);
  } catch (e) {
    try {
      sessionStorage.removeItem(RESTART_KEY);
    } catch {
      /* nothing to clear */
    }
    throw e;
  }
  return true;
}

/** Finish the bank sign-in on /auth/callback */
export async function completeOidc(code: string, state: string): Promise<OidcCallbackResponse['status']> {
  const result = await request<OidcCallbackResponse>('/auth/oidc/callback', {
    method: 'POST',
    body: { code, state },
    anonymous: true,
  });
  if (result.status === 'session') await startSession(result.session);
  if (result.status === 'unlinked') saveLinkToken(result.linkToken);
  return result.status;
}

function saveLinkToken(token: string) {
  try {
    sessionStorage.setItem(LINK_TOKEN_KEY, JSON.stringify({ token, expiresAt: Date.now() + LINK_TOKEN_TTL_MS }));
  } catch {
    /* without storage the new member is simply not linked */
  }
}

/** A VTB ID confirmed by the bank but not linked to anyone yet: it is attached to the family member created next */
export function getLinkToken(): string | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(LINK_TOKEN_KEY) ?? 'null') as { token: string; expiresAt: number } | null;
    if (saved && saved.expiresAt > Date.now()) return saved.token;
  } catch {
    /* broken value — treat as absent */
  }
  clearLinkToken();
  return null;
}

export function clearLinkToken() {
  try {
    sessionStorage.removeItem(LINK_TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Send the pending linkToken with create/join; it is one-time, so it is dropped after success or when stale */
async function withLinkToken<T>(send: (oidcLinkToken: string | undefined) => Promise<T>): Promise<T> {
  const token = getLinkToken() ?? undefined;
  try {
    const result = await send(token);
    if (token) clearLinkToken();
    return result;
  } catch (e) {
    if (e instanceof ApiError && e.field === 'oidcLinkToken') clearLinkToken();
    throw e;
  }
}

export async function getMe(): Promise<Me> {
  return request<Me>('/me');
}

export async function unlinkOidc(): Promise<void> {
  await request<void>('/me/oidc', { method: 'DELETE' });
}

/* ── Budget ── */

export interface BudgetInput {
  monthKey: string;
  totalAmount: number;
  categoryPlans: Record<ExpenseCategory, number>;
}

export async function saveBudget(input: BudgetInput, requestId: string): Promise<MonthlyBudget> {
  const budget = await request<MonthlyBudget>(`/budgets/${input.monthKey}`, {
    method: 'PUT',
    body: { totalAmount: input.totalAmount, categoryPlans: input.categoryPlans },
    requestId,
  });
  useDataStore.setState((s) => ({ budgets: { ...s.budgets, [budgetKey(budget.familyId, budget.monthKey)]: budget } }));
  return budget;
}

/* ── Рассчитанные сервером данные v2 ── */

export function getAccountSummary(month: string): Promise<AccountSummary> {
  return request<AccountSummary>(`/account/summary?${new URLSearchParams({ month })}`);
}

export function getAnalytics(month: string, months = 6): Promise<Analytics> {
  return request<Analytics>(`/analytics?${new URLSearchParams({ month, months: String(months) })}`);
}

export function getCalendar(month: string): Promise<CalendarData> {
  return request<CalendarData>(`/calendar?${new URLSearchParams({ month })}`);
}

export function getAutopayCatalog(): Promise<AutopayCatalog> {
  return request<AutopayCatalog>('/payments/autopay-catalog');
}

export function getPaymentDetails(id: string): Promise<Payment> {
  return request<Payment>(`/payments/${encodeURIComponent(id)}`);
}

export interface PurchaseImport {
  id: string;
  rows: { id: string; date: string | null; amount: number | null; description: string;
    suggestedCategory: ExpenseCategory; duplicate: boolean; error: string | null; expenseId: string | null }[];
}

export function previewPersonalPurchases(filename: string, content: string): Promise<PurchaseImport> {
  return request('/imports', { method: 'POST', body: { filename, content } });
}

export function previewCardPurchases(month: string, requestId: string): Promise<PurchaseImport> {
  return request('/imports/card', { method: 'POST', body: { month }, requestId });
}

export function discardPersonalPurchases(id: string): Promise<void> {
  return request(`/imports/${id}`, { method: 'DELETE' });
}

export async function confirmPersonalPurchases(batch: PurchaseImport, selected: string[], split: boolean): Promise<number> {
  const selectedIds = new Set(selected);
  const rows = batch.rows.map((row) => ({
    id: row.id, include: selectedIds.has(row.id), accountMode: split ? 'personal_split' : 'outside',
  }));
  const result = await request<{ imported: number }>(`/imports/${batch.id}/confirm`, {
    method: 'POST', body: { rows },
  });
  await refreshData().catch(() => {});
  return result.imported;
}

export async function contributeToAccount(amount: number, requestId: string): Promise<AccountContribution> {
  const familyId = useFamilyStore.getState().family?.id;
  const contribution = await request<AccountContribution>('/account/contributions', {
    method: 'POST', body: { amount }, requestId,
  });
  if (useFamilyStore.getState().family?.id === familyId) {
    useDataStore.setState((s) => ({
      accountContributions: [contribution, ...s.accountContributions.filter((item) => item.id !== contribution.id)],
    }));
  }
  return contribution;
}

/* ── Expenses ── */

export interface ExpenseInput {
  id?: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  source?: ExpenseSource;
  splitMode?: SplitMode;
  splitMembers?: string[] | null;
  splitShares?: Record<string, number> | null;
  /** Who paid; omitted — the author (new) or unchanged (edit) */
  paidBy?: string;
}

export async function saveExpense(input: ExpenseInput, requestId: string): Promise<Expense> {
  const { id, ...body } = input;
  const expense = await request<Expense>(id ? `/expenses/${id}` : '/expenses', {
    method: id ? 'PUT' : 'POST', body, requestId,
  });
  if (useFamilyStore.getState().family?.id === expense.familyId) {
    useDataStore.setState((state) => ({ expenses: [expense, ...state.expenses.filter((item) => item.id !== expense.id)] }));
  }
  return expense;
}

export async function deleteExpense(id: string): Promise<void> {
  await request<void>(`/expenses/${id}`, { method: 'DELETE' });
  useDataStore.setState((s) => {
    const expense = s.expenses.find((e) => e.id === id);
    return {
      expenses: s.expenses.filter((e) => e.id !== id),
      // An expense created from a payment: the payment goes back to «Предстоит»
      payments: expense?.paymentId
        ? s.payments.map((p) => (p.id === expense.paymentId ? { ...p, status: 'upcoming', expenseId: undefined } : p))
        : s.payments,
    };
  });
}

/* ── Mandatory payments ── */

export interface PaymentInput {
  id?: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  dueDate: string;
  amountMode: AmountMode;
  recurrence: RecurrenceFrequency;
  interval?: number;
  intervalUnit?: RecurrenceUnit | null;
  endMode?: RecurrenceEndMode;
  endDate?: string | null;
  occurrences?: number | null;
  splitMode: SplitMode;
  splitMembers?: string[] | null;
  splitShares?: Record<string, number> | null;
  /** Для старых платежей без реквизитов не передаётся; выбранный v2-способ всегда приходит со своими полями. */
  paymentMethod?: PaymentMethod;
  autopayType?: AutopayType | null;
  providerCategory?: ProviderCategory | null;
  providerName?: string | null;
  providerIdentifier?: string | null;
  limitAmount?: number | null;
  paymentDetails?: PaymentDetails | null;
}

export async function savePayment(input: PaymentInput, requestId: string): Promise<Payment> {
  const { id, ...body } = input;
  const wasRecurring = id ? useDataStore.getState().payments.find((p) => p.id === id)?.recurring : false;
  let saved: Payment;
  if (id) {
    saved = await request<Payment>(`/payments/${id}`, { method: 'PUT', body, requestId });
    useDataStore.setState((s) => ({ payments: s.payments.map((p) => (p.id === saved.id ? saved : p)) }));
  } else {
    saved = await request<Payment>('/payments', { method: 'POST', body, requestId });
    useDataStore.setState((s) => ({ payments: [...s.payments.filter((p) => p.id !== saved.id), saved] }));
  }
  // Starting or stopping a series changes other months on the server (it creates next month's payment)
  if (Boolean(wasRecurring) !== (input.recurrence !== 'once')) await refreshData().catch(() => {});
  return saved;
}

export async function deletePayment(id: string): Promise<void> {
  await request<void>(`/payments/${id}`, { method: 'DELETE' });
  useDataStore.setState((s) => ({ payments: s.payments.filter((p) => p.id !== id) }));
}

/**
 * Paid → the payment stops being a reserve and becomes an actual expense (counted once).
 * Unpaid → the linked expense is removed and the amount is reserved again.
 */
export async function setPaymentPaid(id: string, paid: boolean, fromSharedAccount = false): Promise<Expense | null> {
  const result = await request<{ payment: Payment; expense: Expense | null }>(`/payments/${id}/paid`, {
    method: 'POST',
    body: { paid, recordToday: paid, fromSharedAccount },
  });
  return applyPaymentResult(id, paid, result);
}

/** Оплатить с общего счёта; при нехватке ошибка содержит числовую сумму дефицита. */
export async function payPayment(id: string): Promise<Expense | null> {
  try {
    const result = await request<{ payment: Payment; expense: Expense | null }>(`/payments/${id}/pay`, {
      method: 'POST',
      requestId: crypto.randomUUID(),
    });
    return applyPaymentResult(id, true, result);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const match = error.message.match(/не хватает\s+([\d\s]+(?:[,.]\d+)?)\s*₽/i);
      const shortage = match ? Number(match[1].replace(/\s/g, '').replace(',', '.')) : Number.NaN;
      if (Number.isFinite(shortage)) throw new SharedAccountShortageError(shortage);
    }
    throw error;
  }
}

/** Эмуляция выставленного поставщиком счёта. */
export async function issuePaymentInvoice(id: string, amount: number): Promise<Payment> {
  const payment = await request<Payment>(`/payments/${id}/invoice`, {
    method: 'POST', body: { amount }, requestId: crypto.randomUUID(),
  });
  useDataStore.setState((s) => ({ payments: s.payments.map((item) => (item.id === payment.id ? payment : item)) }));
  if (payment.status === 'paid') await refreshData().catch(() => {});
  return payment;
}

function applyPaymentResult(
  id: string,
  paid: boolean,
  result: { payment: Payment; expense: Expense | null },
): Expense | null {
  if (useFamilyStore.getState().family?.id !== result.payment.familyId) return result.expense;
  useDataStore.setState((s) => {
    let expenses = s.expenses;
    if (!paid) expenses = expenses.filter((item) => item.paymentId !== id);
    if (result.expense && !expenses.some((item) => item.id === result.expense?.id)) {
      expenses = [result.expense, ...expenses];
    }
    return { expenses, payments: s.payments.map((p) => (p.id === id ? result.payment : p)) };
  });
  return result.expense;
}

/** Copy all payments of the previous month into this one as upcoming. Returns how many were added. */
export async function copyPaymentsFromPreviousMonth(monthKey: string): Promise<number> {
  const result = await request<{ added: number; payments: Payment[] }>('/payments/copy-previous-month', {
    method: 'POST',
    body: { monthKey },
  });
  useDataStore.setState((s) => ({ payments: [...s.payments, ...result.payments] }));
  return result.added;
}

/* ── Savings goals (§4) ── */

export interface GoalInput {
  id?: string;
  title: string;
  target: number;
  deadline: string | null;
}

function putGoal(goal: Goal) {
  useDataStore.setState((s) => ({
    goals: s.goals.some((g) => g.id === goal.id) ? s.goals.map((g) => (g.id === goal.id ? goal : g)) : [...s.goals, goal],
  }));
}

export async function saveGoal(input: GoalInput, requestId: string): Promise<Goal> {
  const body = { title: input.title, target: input.target, deadline: input.deadline };
  const goal = input.id
    ? await request<Goal>(`/goals/${input.id}`, { method: 'PUT', body, requestId })
    : await request<Goal>('/goals', { method: 'POST', body, requestId });
  putGoal(goal);
  return goal;
}

export async function archiveGoal(id: string): Promise<Goal> {
  const goal = await request<Goal>(`/goals/${id}/archive`, { method: 'POST' });
  putGoal(goal);
  return goal;
}

/** Only a goal without contributions can be deleted; otherwise the server answers 409 and it can be archived */
export async function deleteGoal(id: string): Promise<void> {
  await request<void>(`/goals/${id}`, { method: 'DELETE' });
  useDataStore.setState((s) => ({ goals: s.goals.filter((g) => g.id !== id) }));
}

/** A contribution also tops up the shared account. */
export async function contributeToGoal(id: string, amount: number, requestId: string): Promise<Goal> {
  const { goal, accountContribution } = await request<{ goal: Goal; accountContribution?: AccountContribution | null }>(
    `/goals/${id}/contributions`, { method: 'POST', body: { amount }, requestId },
  );
  if (useFamilyStore.getState().family?.id !== goal.familyId) return goal;
  putGoal(goal);
  if (accountContribution) {
    useDataStore.setState((s) => ({
      accountContributions: [accountContribution, ...s.accountContributions.filter((item) => item.id !== accountContribution.id)],
    }));
  } else {
    await refreshData().catch(() => {});
  }
  return goal;
}

/* ── Notifications (§9) ── */

export async function listNotifications(): Promise<AppNotification[]> {
  const items = await request<AppNotification[]>('/notifications');
  return items.filter((item) => item.kind !== 'request_created' && item.kind !== 'request_decided');
}

export async function markNotificationsRead(): Promise<void> {
  await request<void>('/notifications/read-all', { method: 'POST' });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}
