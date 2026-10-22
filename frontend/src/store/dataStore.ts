import { create } from 'zustand';
import type { Expense, MonthlyBudget, Payment } from '../types';

/**
 * Family data loaded from the backend. Components never mutate it directly — all writes go through
 * `src/api/client.ts`, which sends them to the server and applies the response here.
 */
interface DataState {
  budgets: Record<string, MonthlyBudget>; // key: budgetKey(familyId, monthKey)
  expenses: Expense[];
  payments: Payment[];
}

export function budgetKey(familyId: string, monthKey: string): string {
  return `${familyId}:${monthKey}`;
}

export const useDataStore = create<DataState>()(
  (): DataState => ({
    budgets: {},
    expenses: [],
    payments: [],
  })
);
