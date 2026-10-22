import { useMemo } from 'react';
import { budgetKey, useDataStore } from '../store/dataStore';
import { useFamilyStore } from '../store/familyStore';
import { useUIStore } from '../store/uiStore';
import { computeMonthSummary, type MonthSummary } from '../domain/budget';

/** Summary for the viewed month (or an explicit one). Every screen reads numbers from here. */
export function useMonthSummary(explicitMonthKey?: string): MonthSummary {
  const viewedMonth = useUIStore((s) => s.monthKey);
  const monthKey = explicitMonthKey ?? viewedMonth;
  const familyId = useFamilyStore((s) => s.family?.id ?? '');
  const budget = useDataStore((s) => s.budgets[budgetKey(familyId, monthKey)] ?? null);
  const expenses = useDataStore((s) => s.expenses);
  const payments = useDataStore((s) => s.payments);

  return useMemo(
    () => computeMonthSummary(budget, expenses, payments, familyId, monthKey),
    [budget, expenses, payments, familyId, monthKey]
  );
}
