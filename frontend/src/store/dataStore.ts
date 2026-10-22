import { create } from 'zustand';
import type { Allowance, Expense, MonthlyBudget, Payment } from '../types';

/**
 * Family data loaded from the backend. Components never mutate it directly — all writes go through
 * `src/api/client.ts`, which sends them to the server and applies the response here.
 */
interface DataState {
  budgets: Record<string, MonthlyBudget>; // key: budgetKey(familyId, monthKey)
  expenses: Expense[];
  payments: Payment[];
  /** Pocket money: an adult sees every child, a child — only own */
  allowances: Allowance[];
}

export function budgetKey(familyId: string, monthKey: string): string {
  return `${familyId}:${monthKey}`;
}

export const useDataStore = create<DataState>()(
  (): DataState => ({
    budgets: {},
    expenses: [],
    payments: [],
    allowances: [],
  })
);
