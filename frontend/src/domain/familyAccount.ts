import type { AccountContribution, AccountMode, Expense, Payment } from '../types';
import { shiftMonth, todayISO } from '../utils/date';

const kopecks = (amount: number) => Math.round(amount * 100);

export function usesFamilyAccount(mode: AccountMode | null | undefined) {
  return mode === 'shared_split' || mode === 'shared_common';
}

export function computeAccountAtDate(date: string, expenses: Expense[], contributions: AccountContribution[]): number {
  const incoming = contributions.reduce((sum, item) => item.date <= date ? sum + kopecks(item.amount) : sum, 0);
  const outgoing = expenses.reduce((sum, item) =>
    item.date <= date && usesFamilyAccount(item.accountMode) ? sum + kopecks(item.amount) : sum, 0);
  return (incoming - outgoing) / 100;
}

export function plannedSharedExpensesThrough(date: string, payments: Payment[]): number {
  return payments.reduce((sum, item) => item.status === 'upcoming' && item.dueDate <= date && usesFamilyAccount(item.accountMode)
    ? sum + kopecks(item.amount) : sum, 0) / 100;
}

export function expenseShares(expense: Expense): { id: string; amount: number }[] {
  if (expense.accountMode !== 'shared_split' && expense.accountMode !== 'personal_split') return [];
  const total = kopecks(expense.amount);
  const percentages = expense.splitPercentages;
  const ids = percentages ? Object.keys(percentages) : expense.splitMembers ?? [];
  if (!ids.length) return [];
  const denominator = percentages ? 100 : ids.length;
  const shares = ids.map((id) => {
    const numerator = total * (percentages?.[id] ?? 1);
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
  const cutoff = month === today.slice(0, 7) ? today : `${month}-31`;
  const balance = computeAccountAtDate(cutoff, expenses, contributions);
  const relevantPayments = month < today.slice(0, 7) ? payments.filter((item) => item.dueDate.startsWith(month)) : payments;
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
    if (shares.length && expense.accountMode === 'personal_split' && expense.paidBy) {
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
      const account = usesFamilyAccount(expense.accountMode) ? 'shared' : expense.accountMode ? 'personal' : 'legacy';
      totals[account] += kopecks(expense.amount);
    }
    return {
      month: key, balance: computeAccountAtDate(cutoff, expenses, contributions),
      shared: totals.shared / 100, personal: totals.personal / 100, legacy: totals.legacy / 100,
    };
  });
}
