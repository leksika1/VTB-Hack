import type { AccountContribution, Expense, Family, Payment } from '../types';

interface DemoAccount {
  familyId: string;
  expenses: Record<string, Pick<Expense, 'accountMode' | 'splitMembers' | 'splitPercentages'> & { date?: string }>;
  contributions: Record<string, number>;
}

const STORAGE_KEY = 'fb-demo-account-v1';
let cached: DemoAccount | null = null;

function read(familyId: string) {
  if (cached?.familyId === familyId) return cached;
  try {
    const saved: DemoAccount | null = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved?.familyId === familyId) return (cached = saved);
  } catch { /* use the in-memory copy if storage is unavailable */ }
  return null;
}

function write(data: DemoAccount | null) {
  cached = data;
  try {
    if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* the demo still works in this browser session */ }
}

export function clearDemoAccount(familyId: string) {
  if (read(familyId)) write(null);
}

/** Enrich the server’s sample once, at the client boundary. Real families use the API response verbatim. */
export function applyDemoAccount(family: Family, currentUserId: string, expenses: Expense[], payments: Payment[], contributions: AccountContribution[]) {
  if (!family.isDemo || family.members.find((member) => member.id === currentUserId)?.role === 'child') {
    return { expenses, contributions };
  }
  let demo = read(family.id);
  if (!demo) {
    const adults = family.members.filter((member) => member.role !== 'child');
    const first = adults[0]?.id;
    const second = adults[1]?.id;
    demo = { familyId: family.id, expenses: {}, contributions: {} };
    if (first && second) {
      const splitMembers = [first, second];
      const shared = expenses.find((item) => item.title === 'Продукты на неделю' && item.amount === 6850.4);
      if (shared) demo.expenses[shared.id] = { accountMode: 'shared_split', splitMembers, splitPercentages: { [first]: 60, [second]: 40 } };
      const personal = expenses.find((item) => item.title === 'Фрукты и сыр на рынке' && item.amount === 2150);
      if (personal) demo.expenses[personal.id] = { accountMode: 'personal_split', splitMembers };
      const older = expenses.find((item) => item.title === 'Продукты на месяц' && item.amount === 39800 && !item.accountMode);
      if (older) demo.expenses[older.id] = { accountMode: 'outside' };
      for (const payment of payments) {
        if (payment.status !== 'paid' || !payment.expenseId || !payment.accountMode) continue;
        const expense = expenses.find((item) => item.id === payment.expenseId);
        if (expense && !expense.accountMode) demo.expenses[expense.id] = { accountMode: payment.accountMode, splitMembers };
      }
      const opening = contributions.find((item) => item.amount === 68789.9);
      if (opening) demo.contributions[opening.id] = 120000;
    }
    write(demo);
  }
  return {
    expenses: expenses.map((item) => ({ ...item, ...demo.expenses[item.id] })),
    contributions: contributions.map((item) => ({ ...item, amount: demo.contributions[item.id] ?? item.amount })),
  };
}

export function patchDemoExpense(expense: Expense, patch: DemoAccount['expenses'][string] | null): Expense {
  const demo = read(expense.familyId) ?? { familyId: expense.familyId, expenses: {}, contributions: {} };
  if (patch) demo.expenses[expense.id] = patch;
  else delete demo.expenses[expense.id];
  write(demo);
  return { ...expense, ...patch };
}
