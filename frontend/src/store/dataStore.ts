import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Expense, MonthlyBudget, Payment } from '../types';

/**
 * Raw family data. Components never mutate it directly — all writes go through
 * `src/api/client.ts`, which plays the role of the server (permissions, validation, idempotency).
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
  persist(
    (): DataState => ({
      budgets: {},
      expenses: [],
      payments: [],
    }),
    { name: 'fb-data-v2' }
  )
);
