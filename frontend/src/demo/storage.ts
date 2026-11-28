import { createDemoSeed } from './seed';
import { LOCAL_DEMO_SCHEMA, LOCAL_DEMO_STORAGE_KEY, type DemoState } from './types';

let memoryState: DemoState | null = null;

function valid(value: unknown): value is DemoState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<DemoState>;
  return state.schema === LOCAL_DEMO_SCHEMA
    && typeof state.familyId === 'string'
    && typeof state.currentUserId === 'string'
    && Array.isArray(state.members)
    && Array.isArray(state.expenses)
    && Array.isArray(state.payments)
    && Array.isArray(state.goals)
    && Array.isArray(state.notifications);
}

function readStored(): DemoState | null {
  try {
    const raw = localStorage.getItem(LOCAL_DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (valid(parsed)) return parsed;
    localStorage.removeItem(LOCAL_DEMO_STORAGE_KEY);
  } catch {
    // localStorage может быть запрещён политикой браузера; демо всё равно работает в памяти вкладки.
  }
  return null;
}

export function hasStoredLocalDemo(): boolean {
  return memoryState !== null || readStored() !== null;
}

export function getDemoState(): DemoState {
  const stored = memoryState ?? readStored();
  if (stored) {
    stored.preferences ??= Object.fromEntries(stored.members.map((member) => [member.id, {
      debtReminderThresholdKop: 100_000,
      defaultSplit: 'ask' as const,
      calendarEnabled: true,
    }]));
    memoryState = stored;
    return stored;
  }
  memoryState = createDemoSeed();
  saveDemoState(memoryState);
  return memoryState;
}

export function saveDemoState(state: DemoState): void {
  memoryState = state;
  try {
    localStorage.setItem(LOCAL_DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // В приватном режиме хранилище может быть недоступно или переполнено.
  }
}

export function clearDemoState(): void {
  memoryState = null;
  try {
    localStorage.removeItem(LOCAL_DEMO_STORAGE_KEY);
  } catch {
    // Сессия в Zustand всё равно будет закрыта; остаток недоступного storage не мешает работе.
  }
}
