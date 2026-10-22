/**
 * Client of the backend API (backend/app/api, docs/ARCHITECTURE.md).
 * Every write goes to the server; the answer is applied to the local stores so screens update at once.
 * The server owns permissions, validation and idempotency (Idempotency-Key = the form's requestId).
 */
import { budgetKey, useDataStore } from '../store/dataStore';
import { useFamilyStore } from '../store/familyStore';
import { useUIStore } from '../store/uiStore';
import type { Allowance, Expense, ExpenseCategory, Family, InviteLink, InvitePreview, Me, MonthlyBudget, Payment, Role } from '../types';

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

const NETWORK_ERROR = 'Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.';
const SESSION_EXPIRED = 'Сессия истекла. Откройте приложение заново.';

/** Empty — same origin: /api is proxied by vite in dev and by nginx in the container */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  requestId?: string;
  /** Requests made before there is a session (create, join, demo) */
  anonymous?: boolean;
}

async function request<T>(path: string, { method = 'GET', body, requestId, anonymous }: RequestOptions = {}): Promise<T> {
  if (useUIStore.getState().simulateErrors) throw new ApiError(NETWORK_ERROR);

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

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !anonymous) clearSession();
    const error = data?.error;
    if (error?.message) throw new ApiError(error.message, error.field ?? undefined, response.status);
    throw new ApiError(response.status >= 500 ? 'Сервер временно недоступен. Попробуйте ещё раз.' : NETWORK_ERROR);
  }
  return data as T;
}

/* ── Session ── */

interface SessionResponse {
  token: string;
  currentUserId: string;
  family: Family;
}

interface StateResponse {
  family: Family;
  currentUserId: string;
  budgets: MonthlyBudget[];
  expenses: Expense[];
  payments: Payment[];
  allowances?: Allowance[];
}

function clearSession() {
  useFamilyStore.setState({ family: null, currentUserId: null, token: null });
  useDataStore.setState({ budgets: {}, expenses: [], payments: [], allowances: [] });
}

function applyState(state: StateResponse) {
  useFamilyStore.setState({ family: state.family, currentUserId: state.currentUserId });
  useDataStore.setState({
    budgets: Object.fromEntries(state.budgets.map((b) => [budgetKey(b.familyId, b.monthKey), b])),
    expenses: state.expenses,
    payments: state.payments,
    allowances: state.allowances ?? [],
  });
}

async function startSession(session: SessionResponse): Promise<Family> {
  useFamilyStore.setState({ token: session.token, family: session.family, currentUserId: session.currentUserId });
  applyState(await request<StateResponse>('/state'));
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
    applyState(await request<StateResponse>('/state'));
  } catch (e) {
    // The session is gone (member left, family deleted) — back to onboarding instead of an error screen
    if (e instanceof ApiError && e.status === 401) return;
    throw e;
  }
}

/** Silent refresh to pick up changes made by other family members */
export async function refreshData(): Promise<void> {
  if (!useFamilyStore.getState().token || useUIStore.getState().simulateErrors) return;
  applyState(await request<StateResponse>('/state'));
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
          if (messages.some((m) => /^event: (changed|ready)$/m.test(m))) onChange();
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

/** What the invited person sees before joining: family name, members, with which role and whether an adult approves */
export async function getInvitePreview(code: string): Promise<InvitePreview> {
  const normalized = normalizeInviteCode(code);
  return request<InvitePreview>(`/invites/${normalized}`, { anonymous: true });
}

function normalizeInviteCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  // 6 characters: family or child code; 16: invite link (joins without approval)
  if (!/^[A-Z0-9]{6}([A-Z0-9]{10})?$/.test(normalized)) {
    throw new ApiError('Код — 6 латинских букв и цифр, код из ссылки — 16', 'code');
  }
  return normalized;
}

/** Join by a family code, child code or invite link. By code the member waits for approval (family.pending). */
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

/** A personal copy of the demo family on the server */
export async function startDemo(): Promise<Family> {
  return startSession(await request<SessionResponse>('/demo', { method: 'POST', anonymous: true }));
}

export async function leaveFamily(): Promise<void> {
  await request<void>('/family/leave', { method: 'POST' });
  clearSession();
}

/** Demo only: act as another member of the demo family */
export async function switchDemoUser(userId: string): Promise<void> {
  const session = await request<SessionResponse>('/family/switch-user', { method: 'POST', body: { userId } });
  await startSession(session);
}

/** Re-read the family: used while waiting for approval */
export async function reloadState(): Promise<void> {
  applyState(await request<StateResponse>('/state'));
}

/* ── Members and invites (adults) ── */

/** Invite link: whoever opens it joins at once, without approval. The code is shown only now */
export async function createInviteLink(role: Role): Promise<InviteLink> {
  return request<InviteLink>('/family/invite-links', { method: 'POST', body: { role } });
}

export async function approveMember(memberId: string): Promise<void> {
  const family = await request<Family>(`/family/members/${memberId}/approve`, { method: 'POST' });
  useFamilyStore.setState({ family });
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

/* ── Expenses ── */

export interface ExpenseInput {
  id?: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
}

export async function saveExpense(input: ExpenseInput, requestId: string): Promise<Expense> {
  const body = { title: input.title, amount: input.amount, category: input.category, date: input.date };
  if (input.id) {
    const updated = await request<Expense>(`/expenses/${input.id}`, { method: 'PUT', body, requestId });
    useDataStore.setState((s) => ({ expenses: s.expenses.map((e) => (e.id === updated.id ? updated : e)) }));
    return updated;
  }
  const created = await request<Expense>('/expenses', { method: 'POST', body, requestId });
  useDataStore.setState((s) => ({ expenses: [created, ...s.expenses.filter((e) => e.id !== created.id)] }));
  return created;
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
}

export async function savePayment(input: PaymentInput, requestId: string): Promise<Payment> {
  const body = { title: input.title, amount: input.amount, category: input.category, dueDate: input.dueDate };
  if (input.id) {
    const updated = await request<Payment>(`/payments/${input.id}`, { method: 'PUT', body, requestId });
    useDataStore.setState((s) => ({ payments: s.payments.map((p) => (p.id === updated.id ? updated : p)) }));
    return updated;
  }
  const created = await request<Payment>('/payments', { method: 'POST', body, requestId });
  useDataStore.setState((s) => ({ payments: [...s.payments.filter((p) => p.id !== created.id), created] }));
  return created;
}

export async function deletePayment(id: string): Promise<void> {
  await request<void>(`/payments/${id}`, { method: 'DELETE' });
  useDataStore.setState((s) => ({ payments: s.payments.filter((p) => p.id !== id) }));
}

/**
 * Paid → the payment stops being a reserve and becomes an actual expense (counted once).
 * Unpaid → the linked expense is removed and the amount is reserved again.
 */
export async function setPaymentPaid(id: string, paid: boolean): Promise<Expense | null> {
  const linkedBefore = useDataStore.getState().payments.find((p) => p.id === id)?.expenseId;
  const result = await request<{ payment: Payment; expense: Expense | null }>(`/payments/${id}/paid`, {
    method: 'POST',
    body: { paid },
  });
  useDataStore.setState((s) => {
    let expenses = s.expenses;
    if (!paid && linkedBefore) expenses = expenses.filter((e) => e.id !== linkedBefore);
    if (result.expense) expenses = [result.expense, ...expenses.filter((e) => e.id !== result.expense!.id)];
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

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}
