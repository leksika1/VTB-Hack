import { useState, useMemo } from 'react';
import { useFamilyStore } from './store/familyStore';
import { useBudgetStore } from './store/budgetStore';
import { useExpensesStore } from './store/expensesStore';
import { useUIStore } from './store/uiStore';
import { toMonthKey } from './utils/date';
import { ALL_CATEGORIES, CATEGORIES } from './utils/categories';
import { formatCurrency } from './utils/currency';
import type { ExpenseCategory } from './types';

import { CreateFamilyView } from './components/family/CreateFamilyView';
import { FamilyHeader } from './components/family/FamilyHeader';
import { InviteModal } from './components/family/InviteModal';
import { FamilySettingsModal } from './components/family/FamilySettingsModal';
import { MonthSelector } from './components/budget/MonthSelector';
import { BudgetSummaryCard } from './components/budget/BudgetSummaryCard';
import { CategoryBudgets } from './components/budget/CategoryBudgets';
import { BudgetConfigModal } from './components/budget/BudgetConfigModal';
import { SpendingChart } from './components/budget/SpendingChart';
import { ExpenseList } from './components/expenses/ExpenseList';
import { ExpenseModal } from './components/expenses/ExpenseModal';
import { DeleteConfirmModal } from './components/expenses/DeleteConfirmModal';
import { FloatingDock } from './components/navigation/FloatingDock';
import { ToastContainer } from './components/ui/ToastContainer';
import { EmptyState } from './components/ui/EmptyState';
import { Settings2, UserPlus, Search, Plus } from 'lucide-react';

type Tab = 'home' | 'expenses';

export default function App() {
  const family = useFamilyStore((s) => s.family);

  const [monthKey, setMonthKey] = useState(toMonthKey());
  const [activeTab, setActiveTab] = useState<Tab>('home');

  // ── If no family, show create/join screen ──
  if (!family) {
    return (
      <>
        <ToastContainer />
        <CreateFamilyView />
      </>
    );
  }

  return (
    <>
      <ToastContainer />
      <InviteModal />
      <FamilySettingsModal />
      <BudgetConfigModal monthKey={monthKey} />
      <ExpenseModal monthKey={monthKey} />
      <DeleteConfirmModal />

      <div className="min-h-dvh pb-28">
        <div className="mx-auto max-w-lg px-4 pt-6">
          <FamilyHeader />
          <MonthSelector monthKey={monthKey} onChange={setMonthKey} />

          {activeTab === 'home' && (
            <HomeTab familyId={family.id} monthKey={monthKey} />
          )}
          {activeTab === 'expenses' && (
            <ExpensesTab familyId={family.id} monthKey={monthKey} />
          )}
        </div>
      </div>

      <FloatingDock activeTab={activeTab} onTabChange={setActiveTab} />
    </>
  );
}

/* ── Home Tab ── */
function HomeTab({ familyId, monthKey }: { familyId: string; monthKey: string }) {
  const getBudget = useBudgetStore((s) => s.getBudget);
  const getTotalSpent = useExpensesStore((s) => s.getTotalSpent);
  const getSpentByCategory = useExpensesStore((s) => s.getSpentByCategory);
  const getExpensesForMonth = useExpensesStore((s) => s.getExpensesForMonth);
  const openModal = useUIStore((s) => s.openModal);
  const family = useFamilyStore((s) => s.family);

  const budget = getBudget(monthKey);
  const totalSpent = getTotalSpent(familyId, monthKey);
  const spentByCategory = getSpentByCategory(familyId, monthKey);
  const expenses = getExpensesForMonth(familyId, monthKey);
  const recentExpenses = useMemo(() => expenses.slice(0, 5), [expenses]);

  // Empty state: no budget configured for this month
  if (!budget) {
    return (
      <EmptyState
        icon={<Settings2 size={28} />}
        title="Бюджет ещё не настроен"
        description="Укажите общую сумму и распределите по 5 категориям"
        action={
          <button
            onClick={() => openModal('budgetConfig')}
            className="px-5 py-2.5 rounded-[var(--radius-button)] bg-[var(--color-lime)] text-[var(--color-text-inverse)]
              font-bold text-xs uppercase tracking-wide hover:brightness-110 active:scale-[0.97] transition-all
              shadow-[0_0_20px_var(--color-lime-glow)]"
          >
            Настроить бюджет
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Summary Card */}
      <BudgetSummaryCard budget={budget.totalAmount} spent={totalSpent} />

      {/* Single member notification */}
      {family && family.members.length === 1 && (
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[rgba(184,255,51,0.08)] flex items-center justify-center shrink-0">
            <UserPlus size={16} className="text-[var(--color-lime)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[var(--color-text-secondary)]">
              Вы пока единственный участник.{' '}
              <button
                onClick={() => openModal('invite')}
                className="text-[var(--color-lime)] font-semibold hover:underline"
              >
                Пригласите партнёра
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Visual Analytics / Donut Chart */}
      {family && expenses.length > 0 && (
        <SpendingChart
          expenses={expenses}
          members={family.members}
          totalSpent={totalSpent}
        />
      )}

      {/* Category Plans & Facts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
            Категории бюджета
          </h2>
          <button
            onClick={() => openModal('budgetConfig')}
            className="text-xs text-[var(--color-lime)] font-semibold hover:underline transition-colors"
          >
            Изменить план
          </button>
        </div>
        <CategoryBudgets plans={budget.categoryPlans} spent={spentByCategory} />
      </div>

      {/* Recent expenses */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
            Последние расходы
          </h2>
          <button
            onClick={() => openModal('addExpense')}
            className="text-xs text-[var(--color-lime)] font-semibold hover:underline transition-colors flex items-center gap-1"
          >
            <Plus size={13} />
            Добавить
          </button>
        </div>
        <ExpenseList
          expenses={recentExpenses}
          onAddClick={() => openModal('addExpense')}
        />
      </div>
    </div>
  );
}

/* ── Expenses Tab with Filter, Search and Member Selection ── */
function ExpensesTab({ familyId, monthKey }: { familyId: string; monthKey: string }) {
  const getExpensesForMonth = useExpensesStore((s) => s.getExpensesForMonth);
  const openModal = useUIStore((s) => s.openModal);
  const family = useFamilyStore((s) => s.family);

  const rawExpenses = getExpensesForMonth(familyId, monthKey);

  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | 'all'>('all');
  const [selectedMember, setSelectedMember] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredExpenses = useMemo(() => {
    return rawExpenses.filter((e) => {
      const matchCategory = selectedCategory === 'all' || e.category === selectedCategory;
      const matchMember = selectedMember === 'all' || e.authorId === selectedMember;
      const matchSearch =
        !searchQuery.trim() ||
        e.title.toLowerCase().includes(searchQuery.trim().toLowerCase());
      return matchCategory && matchMember && matchSearch;
    });
  }, [rawExpenses, selectedCategory, selectedMember, searchQuery]);

  const filteredTotal = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    [filteredExpenses]
  );

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header and Summary */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--color-text-primary)] tracking-tight">
            Все расходы
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Показано {filteredExpenses.length} из {rawExpenses.length} · На сумму {formatCurrency(filteredTotal)}
          </p>
        </div>
        <button
          onClick={() => openModal('addExpense')}
          className="px-3 py-1.5 rounded-xl bg-[var(--color-lime)] text-[var(--color-text-inverse)]
            text-xs font-bold flex items-center gap-1 hover:brightness-110 active:scale-[0.98] transition-all"
        >
          <Plus size={14} />
          Добавить
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по названию покупки..."
          className="w-full pl-10 pr-4 py-2.5 rounded-[var(--radius-input)] bg-[var(--color-bg-input)]
            border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]
            text-xs focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
        />
      </div>

      {/* Filter Pills - Categories */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex items-center justify-center transition-all duration-300 cursor-pointer border active:scale-95"
          style={{
            borderColor: selectedCategory === 'all' ? 'var(--color-lime)' : 'var(--color-border)',
            backgroundColor: selectedCategory === 'all' ? 'rgba(184, 255, 51, 0.15)' : 'var(--color-bg-card)',
            color: selectedCategory === 'all' ? 'var(--color-lime)' : 'var(--color-text-secondary)',
            boxShadow: selectedCategory === 'all' ? '0 0 12px rgba(184, 255, 51, 0.22)' : '0 0 0px transparent',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          Все ({rawExpenses.length})
        </button>
        {ALL_CATEGORIES.map((catKey) => {
          const cfg = CATEGORIES[catKey];
          const active = selectedCategory === catKey;
          const count = rawExpenses.filter((e) => e.category === catKey).length;
          return (
            <button
              key={catKey}
              type="button"
              onClick={() => setSelectedCategory(catKey)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex items-center justify-center gap-1 transition-all duration-300 cursor-pointer border active:scale-95"
              style={{
                borderColor: active ? cfg.color : 'var(--color-border)',
                backgroundColor: active ? `${cfg.color}1c` : 'var(--color-bg-card)',
                color: active ? cfg.color : 'var(--color-text-secondary)',
                boxShadow: active ? `0 0 12px ${cfg.color}26` : '0 0 0px transparent',
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <span>{cfg.label}</span>
              {count > 0 && <span className="opacity-75 text-[10px]">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Filter Pills - Family Members (if > 1) */}
      {family && family.members.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[10px] uppercase font-bold text-[var(--color-text-muted)] mr-1 shrink-0">
            Автор:
          </span>
          <button
            type="button"
            onClick={() => setSelectedMember('all')}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer border"
            style={{
              borderColor: selectedMember === 'all' ? 'var(--color-lime)' : 'var(--color-border)',
              backgroundColor: selectedMember === 'all' ? 'rgba(184, 255, 51, 0.12)' : 'var(--color-bg-card)',
              color: selectedMember === 'all' ? 'var(--color-lime)' : 'var(--color-text-muted)',
            }}
          >
            Все
          </button>
          {family.members.map((m) => {
            const active = selectedMember === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMember(m.id)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer border"
                style={{
                  borderColor: active ? m.color : 'var(--color-border)',
                  backgroundColor: active ? `${m.color}18` : 'var(--color-bg-card)',
                  color: active ? m.color : 'var(--color-text-muted)',
                }}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[9px] font-bold"
                  style={{ backgroundColor: m.color + '33', color: m.color }}
                >
                  {m.name[0]}
                </span>
                <span>{m.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      <ExpenseList
        expenses={filteredExpenses}
        onAddClick={() => openModal('addExpense')}
      />
    </div>
  );
}
