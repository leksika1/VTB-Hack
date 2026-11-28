import type { AccountMode, Expense, Payment } from '../types';

const kopecks = (amount: number) => Math.round(amount * 100);

function usesLegacyFamilyAccount(mode: AccountMode | null | undefined) {
  return mode === 'shared_split' || mode === 'shared_common';
}

export function usesSharedAccount(record: Pick<Expense | Payment, 'source' | 'accountMode'>): boolean {
  return record.source === 'shared' || (!record.source && usesLegacyFamilyAccount(record.accountMode));
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
