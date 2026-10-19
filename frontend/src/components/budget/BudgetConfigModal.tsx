import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { useUIStore } from '../../store/uiStore';
import { useBudgetStore, EMPTY_PLAN } from '../../store/budgetStore';
import { ALL_CATEGORIES, CATEGORIES } from '../../utils/categories';
import { formatCurrency } from '../../utils/currency';
import type { ExpenseCategory } from '../../types';
import { AlertTriangle } from 'lucide-react';

interface BudgetConfigModalProps {
  monthKey: string;
}

export function BudgetConfigModal({ monthKey }: BudgetConfigModalProps) {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);
  const getBudget = useBudgetStore((s) => s.getBudget);
  const setBudget = useBudgetStore((s) => s.setBudget);

  const existing = getBudget(monthKey);

  const [total, setTotal] = useState('');
  const [plans, setPlans] = useState<Record<ExpenseCategory, string>>(
    Object.fromEntries(ALL_CATEGORIES.map((k) => [k, ''])) as Record<ExpenseCategory, string>
  );

  useEffect(() => {
    if (existing) {
      setTotal(String(existing.totalAmount));
      setPlans(
        Object.fromEntries(
          ALL_CATEGORIES.map((k) => [k, String(existing.categoryPlans[k] || '')])
        ) as Record<ExpenseCategory, string>
      );
    } else {
      setTotal('');
      setPlans(Object.fromEntries(ALL_CATEGORIES.map((k) => [k, ''])) as Record<ExpenseCategory, string>);
    }
  }, [existing, monthKey]);

  const totalNum = Number(total) || 0;
  const categoriesSum = useMemo(
    () => ALL_CATEGORIES.reduce((s, k) => s + (Number(plans[k]) || 0), 0),
    [plans]
  );
  const unallocated = totalNum - categoriesSum;
  const overAllocated = unallocated < 0;
  const canSave = totalNum > 0 && !overAllocated;

  const handleSave = () => {
    const categoryPlans: Record<ExpenseCategory, number> = { ...EMPTY_PLAN };
    for (const k of ALL_CATEGORIES) {
      categoryPlans[k] = Number(plans[k]) || 0;
    }
    setBudget(monthKey, totalNum, categoryPlans);
    addToast('Бюджет сохранён!');
    closeModal();
  };

  return (
    <Modal open={activeModal === 'budgetConfig'} onClose={closeModal} title="Настройка бюджета">
      <div className="space-y-5">
        {/* Total budget */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
            Общий бюджет на месяц
          </label>
          <div className="relative">
            <input
              type="number"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="120 000"
              min={0}
              className="w-full px-4 py-3 pr-10 rounded-[var(--radius-input)] bg-[var(--color-bg-input)]
                border border-[var(--color-border)] text-[var(--color-text-primary)]
                placeholder:text-[var(--color-text-muted)] text-lg font-bold
                focus:outline-none focus:border-[var(--color-border-focus)]
                transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)]">₽</span>
          </div>
        </div>

        {/* Category distribution */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
            Распределение по категориям
          </label>
          <div className="space-y-2.5">
            {ALL_CATEGORIES.map((key) => {
              const cfg = CATEGORIES[key];
              const Icon = cfg.icon;
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.bgClass}`}>
                    <Icon size={14} style={{ color: cfg.color }} />
                  </div>
                  <span className="text-sm text-[var(--color-text-primary)] w-24 shrink-0">{cfg.label}</span>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      value={plans[key]}
                      onChange={(e) => setPlans((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder="0"
                      min={0}
                      className="w-full px-3 py-2 pr-8 rounded-[var(--radius-input)] bg-[var(--color-bg-input)]
                        border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm
                        placeholder:text-[var(--color-text-muted)]
                        focus:outline-none focus:border-[var(--color-border-focus)]
                        transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-muted)]">₽</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Unallocated info */}
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold
          ${overAllocated
            ? 'bg-[var(--color-danger-dim)] text-[var(--color-danger)]'
            : 'bg-[rgba(184,255,51,0.08)] text-[var(--color-lime)]'
          }`}>
          {overAllocated && <AlertTriangle size={14} />}
          <span>
            {overAllocated
              ? `Превышено на ${formatCurrency(Math.abs(unallocated))}`
              : `Нераспределённый остаток: ${formatCurrency(unallocated)}`
            }
          </span>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full py-3.5 rounded-[var(--radius-button)] bg-[var(--color-lime)] text-[var(--color-text-inverse)]
            font-bold text-sm uppercase tracking-wide
            hover:brightness-110 active:scale-[0.98]
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-200
            shadow-[0_0_20px_var(--color-lime-glow)]"
        >
          Сохранить бюджет
        </button>
      </div>
    </Modal>
  );
}
