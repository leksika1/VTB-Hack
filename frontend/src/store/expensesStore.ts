import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Expense, ExpenseCategory } from '../types';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface ExpensesState {
  expenses: Expense[];
  addExpense: (data: Omit<Expense, 'id' | 'createdAt'>) => void;
  updateExpense: (id: string, data: Partial<Omit<Expense, 'id' | 'createdAt'>>) => void;
  deleteExpense: (id: string) => void;
  getExpensesForMonth: (familyId: string, monthKey: string) => Expense[];
  getTotalSpent: (familyId: string, monthKey: string) => number;
  getSpentByCategory: (familyId: string, monthKey: string) => Record<ExpenseCategory, number>;
}

export const useExpensesStore = create<ExpensesState>()(
  persist(
    (set, get) => ({
      expenses: [],

      addExpense: (data) => {
        const expense: Expense = {
          ...data,
          id: generateId(),
          createdAt: Date.now(),
        };
        set((state) => ({
          expenses: [expense, ...state.expenses],
        }));
      },

      updateExpense: (id, data) => {
        set((state) => ({
          expenses: state.expenses.map((e) =>
            e.id === id ? { ...e, ...data } : e
          ),
        }));
      },

      deleteExpense: (id) => {
        set((state) => ({
          expenses: state.expenses.filter((e) => e.id !== id),
        }));
      },

      getExpensesForMonth: (familyId, monthKey) => {
        return get().expenses.filter(
          (e) => e.familyId === familyId && e.date.startsWith(monthKey)
        );
      },

      getTotalSpent: (familyId, monthKey) => {
        return get()
          .getExpensesForMonth(familyId, monthKey)
          .reduce((sum, e) => sum + e.amount, 0);
      },

      getSpentByCategory: (familyId, monthKey) => {
        const expenses = get().getExpensesForMonth(familyId, monthKey);
        const result: Record<ExpenseCategory, number> = {
          food: 0,
          housing: 0,
          transport: 0,
          kids: 0,
          other: 0,
        };
        for (const e of expenses) {
          result[e.category] += e.amount;
        }
        return result;
      },
    }),
    { name: 'expenses-store' }
  )
);
