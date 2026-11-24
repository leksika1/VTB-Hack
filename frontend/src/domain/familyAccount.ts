import type { AccountContribution, AccountMode, Expense, Payment } from '../types';

const kopecks = (amount: number) => Math.round(amount * 100);

export function usesFamilyAccount(mode: AccountMode | null | undefined) {
  return mode === 'shared_split' || mode === 'shared_common';
}

export function computeFamilyAccount(
  month: string, expenses: Expense[], payments: Payment[], contributions: AccountContribution[],
) {
  let balance = 0;
  let reserved = 0;
  const members = new Map<string, { contributed: number; share: number; paidPersonally: number }>();
  const memberBalance = (id: string) => {
    const current = members.get(id) ?? { contributed: 0, share: 0, paidPersonally: 0 };
    members.set(id, current);
    return current;
  };

  for (const contribution of contributions) {
    const contributionMonth = contribution.date.slice(0, 7);
    const amount = kopecks(contribution.amount);
    if (contributionMonth <= month) balance += amount;
    if (contributionMonth === month && contribution.memberId) memberBalance(contribution.memberId).contributed += amount;
  }

  for (const expense of expenses) {
    const expenseMonth = expense.date.slice(0, 7);
    const amount = kopecks(expense.amount);
    if (expenseMonth <= month && usesFamilyAccount(expense.accountMode)) balance -= amount;
    if (expenseMonth !== month || !expense.splitMembers?.length) continue;
    const share = Math.floor(amount / expense.splitMembers.length);
    const remainder = amount % expense.splitMembers.length;
    expense.splitMembers.forEach((id, index) => {
      memberBalance(id).share += share + (index < remainder ? 1 : 0);
    });
    if (expense.accountMode === 'personal_split' && expense.paidBy) {
      memberBalance(expense.paidBy).paidPersonally += amount;
    }
  }

  for (const payment of payments) {
    if (payment.status === 'upcoming' && payment.dueDate.startsWith(month) && usesFamilyAccount(payment.accountMode)) {
      reserved += kopecks(payment.amount);
    }
  }

  return {
    balance: balance / 100,
    reserved: reserved / 100,
    available: (balance - reserved) / 100,
    members: new Map([...members].map(([id, item]) => [id, {
      contributed: item.contributed / 100,
      share: item.share / 100,
      paidPersonally: item.paidPersonally / 100,
      balance: (item.contributed + item.paidPersonally - item.share) / 100,
    }])),
  };
}
