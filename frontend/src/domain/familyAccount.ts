import type { AccountContribution, AccountMode, Expense, Payment } from '../types';
import { shiftMonth, todayISO } from '../utils/date';

const kopecks = (amount: number) => Math.round(amount * 100);

function usesLegacyFamilyAccount(mode: AccountMode | null | undefined) {
  return mode === 'shared_split' || mode === 'shared_common';
}

export function usesSharedAccount(record: Pick<Expense | Payment, 'source' | 'accountMode'>): boolean {
  return record.source === 'shared' || (!record.source && usesLegacyFamilyAccount(record.accountMode));
}

export function computeAccountAtDate(date: string, expenses: Expense[], contributions: AccountContribution[]): number {
  const incoming = contributions.reduce((sum, item) => item.date <= date ? sum + kopecks(item.amount) : sum, 0);
  const outgoing = expenses.reduce((sum, item) =>
    item.date <= date && usesSharedAccount(item) ? sum + kopecks(item.amount) : sum, 0);
  return (incoming - outgoing) / 100;
}

export function plannedSharedExpensesThrough(date: string, payments: Payment[]): number {
  return payments.reduce((sum, item) => item.status === 'upcoming' && item.dueDate <= date && usesSharedAccount(item)
    ? sum + kopecks(item.amount) : sum, 0) / 100;
}

export function expenseShares(expense: Expense): { id: string; amount: number }[] {
  const mode = expense.splitMode ?? (
    expense.splitPercentages ? 'shares' : expense.accountMode?.endsWith('_split') ? 'equal' : 'none'
  );
  if (mode === 'none') return [];
  const total = kopecks(expense.amount);
  const weights = expense.splitShares ?? (expense.splitPercentages
    ? Object.fromEntries(Object.entries(expense.splitPercentages).map(([id, percent]) => [id, percent * 100]))
    : null);
  const ids = expense.splitMembers ?? (weights ? Object.keys(weights) : []);
  if (!ids.length) return [];
  const denominator = mode === 'equal' ? ids.length : Object.values(weights ?? {}).reduce((sum, value) => sum + value, 0);
  if (!denominator) return [];
  const shares = ids.map((id) => {
    const numerator = total * (mode === 'equal' ? 1 : weights?.[id] ?? 0);
    return { id, amount: Math.floor(numerator / denominator), remainder: numerator % denominator };
  });
  const remaining = total - shares.reduce((sum, share) => sum + share.amount, 0);
  const ranked = [...shares].sort((a, b) => b.remainder - a.remainder);
  for (const share of ranked.slice(0, remaining)) share.amount += 1;
  return shares.map(({ id, amount }) => ({ id, amount }));
}

export function computeFamilyAccount(
  month: string, expenses: Expense[], payments: Payment[], contributions: AccountContribution[], today = todayISO(),
) {
  const currentMonth = today.slice(0, 7);
  const cutoff = month < currentMonth ? `${month}-31` : today;
  const balance = computeAccountAtDate(cutoff, expenses, contributions);
  const relevantPayments = payments.filter((item) => item.dueDate.startsWith(month));
  const reserved = plannedSharedExpensesThrough(`${month}-31`, relevantPayments);
  const members = new Map<string, { contributed: number; share: number; paidPersonally: number }>();
  const memberBalance = (id: string) => {
    const current = members.get(id) ?? { contributed: 0, share: 0, paidPersonally: 0 };
    members.set(id, current);
    return current;
  };

  for (const contribution of contributions) {
    if (contribution.date.startsWith(month) && contribution.date <= cutoff && contribution.memberId) {
      memberBalance(contribution.memberId).contributed += kopecks(contribution.amount);
    }
  }
  for (const expense of expenses) {
    if (!expense.date.startsWith(month) || expense.date > cutoff) continue;
    const shares = expenseShares(expense);
    for (const { id, amount } of shares) memberBalance(id).share += amount;
    if (shares.length && (expense.source === 'personal' || expense.accountMode === 'personal_split') && expense.paidBy) {
      memberBalance(expense.paidBy).paidPersonally += kopecks(expense.amount);
    }
  }

  const totalShare = [...members.values()].reduce((sum, item) => sum + item.share, 0);
  const totalContributions = [...members.values()].reduce((sum, item) => sum + item.contributed, 0);
  return {
    balance,
    reserved,
    available: (kopecks(balance) - kopecks(reserved)) / 100,
    members: new Map([...members].map(([id, item]) => [id, {
      contributed: item.contributed / 100,
      contributedPercent: totalContributions ? item.contributed / totalContributions * 100 : 0,
      share: item.share / 100,
      percent: totalShare ? item.share / totalShare * 100 : 0,
      paidPersonally: item.paidPersonally / 100,
      due: Math.max(0, item.share - item.contributed - item.paidPersonally) / 100,
    }])),
  };
}

export function computeAccountHistory(month: string, expenses: Expense[], contributions: AccountContribution[], today = todayISO()) {
  const currentMonth = today.slice(0, 7);
  const months = [-2, -1, 0].map((offset) => shiftMonth(month, offset));
  return months.map((key) => {
    if (key > currentMonth) return { month: key, balance: null, shared: null, personal: null, legacy: null };
    const cutoff = key === currentMonth ? today : `${key}-31`;
    const totals = { shared: 0, personal: 0, legacy: 0 };
    for (const expense of expenses) {
      if (!expense.date.startsWith(key) || expense.date > cutoff) continue;
      const account = usesSharedAccount(expense) ? 'shared' : expense.source === 'personal' || expense.accountMode ? 'personal' : 'legacy';
      totals[account] += kopecks(expense.amount);
    }
    return {
      month: key, balance: computeAccountAtDate(cutoff, expenses, contributions),
      shared: totals.shared / 100, personal: totals.personal / 100, legacy: totals.legacy / 100,
    };
  });
}
