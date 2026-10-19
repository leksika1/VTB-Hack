import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MonthlyBudget, ExpenseCategory } from '../types';

const EMPTY_PLAN: Record<ExpenseCategory, number> = {
  food: 0,
  housing: 0,
  transport: 0,
  kids: 0,
  other: 0,
};

interface BudgetState {
  budgets: Record<string, MonthlyBudget>; // key: 'YYYY-MM'
  setBudget: (monthKey: string, totalAmount: number, categoryPlans: Record<ExpenseCategory, number>) => void;
  getBudget: (monthKey: string) => MonthlyBudget | null;
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      budgets: {},

      setBudget: (monthKey, totalAmount, categoryPlans) => {
        set((state) => ({
          budgets: {
            ...state.budgets,
            [monthKey]: { monthKey, totalAmount, categoryPlans },
          },
        }));
      },

      getBudget: (monthKey) => {
        return get().budgets[monthKey] ?? null;
      },
    }),
    { name: 'budget-store' }
  )
);

export { EMPTY_PLAN };
