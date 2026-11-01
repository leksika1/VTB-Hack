import { useMemo, useState } from 'react';
import { Download, Plus, ReceiptText, Search, SearchX, SlidersHorizontal, X } from 'lucide-react';
import type { ExpenseCategory } from '../types';
import { useMonthSummary } from '../hooks/useMonthSummary';
import { useMonthChanged } from '../hooks/useMonthChanged';
import { useUIStore } from '../store/uiStore';
import { useFamilyStore } from '../store/familyStore';
import { ALL_CATEGORIES, CATEGORIES } from '../utils/categories';
import { formatCurrency } from '../utils/currency';
import { formatMonthLower, plural } from '../utils/date';
import { fuzzyMatch } from '../utils/search';
import { downloadFile, expensesToCsv } from '../utils/csv';
import { Card, PageHeader } from '../components/ui/Card';
import { MonthSwitcher } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Feedback';
import { ExpenseDayGroups } from '../components/expenses/ExpenseList';
import { SpendingCharts } from '../components/expenses/SpendingCharts';

export function OperationsPage() {
  const monthKey = useUIStore((s) => s.monthKey);
  const openModal = useUIStore((s) => s.openModal);
  const addToast = useUIStore((s) => s.addToast);
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const { expenses } = useMonthSummary();
  const monthIn = useMonthChanged() ? 'animate-month-in' : '';

  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [author, setAuthor] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilters = categories.length + (author ? 1 : 0);
  const hasRestrictions = activeFilters > 0 || query.trim() !== '';

  // Search tolerates typos (Levenshtein) and also looks at the category name. Day order is kept.
  // Search and author first: the chart is built from this set, so it keeps every category visible
  const { searched, withTypos } = useMemo(() => {
    const matched = expenses
      .filter((e) => !author || e.authorId === author)
      .map((e) => ({ expense: e, match: fuzzyMatch(query, `${e.title} ${CATEGORIES[e.category].label}`) }))
      .filter((m) => m.match !== null);
    return {
      searched: matched.map((m) => m.expense),
      withTypos: matched.some((m) => (m.match?.score ?? 0) > 0),
    };
  }, [expenses, author, query]);

  // Then the category filter (chips or a click on the chart) for the list
  const filtered = useMemo(
    () => (categories.length === 0 ? searched : searched.filter((e) => categories.includes(e.category))),
    [searched, categories]
  );

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  const resetAll = () => {
    setQuery('');
    setCategories([]);
    setAuthor(null);
  };

  // Exactly what the list shows: the month with search and filters applied
  const exportCsv = () => {
    downloadFile(`операции-${monthKey}.csv`, expensesToCsv(filtered, family), 'text/csv;charset=utf-8');
    addToast(`Скачан файл: ${filtered.length} ${plural(filtered.length, 'операция', 'операции', 'операций')}`, 'info');
  };

  const toggleCategory = (key: ExpenseCategory) =>
    setCategories((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <>
      <PageHeader title="Операции">
        <div className="flex items-center gap-3">
          <MonthSwitcher />
          {filtered.length > 0 && (
            <Button
              variant="neutral"
              icon={<Download size={18} />}
              onClick={exportCsv}
              aria-label={hasRestrictions ? 'Скачать найденные операции в CSV' : 'Скачать операции месяца в CSV'}
              title="Скачать CSV для Excel"
              className="max-sm:w-11 max-sm:px-0"
            >
              <span className="hidden sm:inline">CSV</span>
            </Button>
          )}
          <Button
            variant="brand"
            icon={<Plus size={20} />}
            onClick={() => openModal({ type: 'expenseForm' })}
            aria-label="Добавить расход"
            className="max-sm:w-11 max-sm:px-0"
          >
            <span className="hidden sm:inline">Добавить</span>
          </Button>
        </div>
      </PageHeader>

      <Card className="p-4 sm:p-5">
        <div className="flex gap-2.5">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию"
              aria-label="Поиск по названию операции"
              className="w-full h-11 pl-10 pr-4 rounded-[var(--radius-control)] bg-surface-muted border border-transparent text-ink
                placeholder:text-ink-3 focus:outline-none focus:bg-surface focus:border-accent focus:ring-[3px] focus:ring-accent/15"
            />
          </div>
          <Button
            variant={activeFilters > 0 ? 'secondary' : 'neutral'}
            icon={<SlidersHorizontal size={18} />}
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls="operation-filters"
          >
            Фильтры{activeFilters > 0 && ` (${activeFilters})`}
          </Button>
        </div>

        <div id="operation-filters" className="collapsible" data-open={filtersOpen} inert={!filtersOpen}>
          <div>
            <div className="pt-4 space-y-4">
              <fieldset>
                <legend className="text-sm font-medium text-ink-2 mb-2">Категории</legend>
                <div className="flex flex-wrap gap-2">
                  {ALL_CATEGORIES.map((key) => (
                    <Chip key={key} active={categories.includes(key)} onClick={() => toggleCategory(key)}>
                      {CATEGORIES[key].label}
                    </Chip>
                  ))}
                </div>
              </fieldset>
              {family && family.members.length > 1 && (
                <fieldset>
                  <legend className="text-sm font-medium text-ink-2 mb-2">Кто добавил</legend>
                  <div className="flex flex-wrap gap-2">
                    <Chip active={author === null} onClick={() => setAuthor(null)}>
                      Все
                    </Chip>
                    {family.members.map((m) => (
                      <Chip key={m.id} active={author === m.id} onClick={() => setAuthor(m.id)}>
                        {m.id === currentUserId ? `${m.name} (вы)` : m.name}
                      </Chip>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          </div>
        </div>

        {hasRestrictions && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="text-ink-2">
              Найдено {filtered.length} из {expenses.length} на сумму <span className="tabular">{formatCurrency(total)}</span>
              {withTypos && <>, с учётом возможных опечаток</>}
            </span>
            <button type="button" onClick={resetAll} className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
              <X size={15} aria-hidden />
              Сбросить
            </button>
          </div>
        )}
      </Card>

      {searched.length > 0 && (
        <SpendingCharts key={`charts-${monthKey}`} expenses={searched} selected={categories} onToggle={toggleCategory} className={monthIn} />
      )}

      <Card key={`list-${monthKey}`} className={`p-4 sm:p-5 mt-5 ${monthIn}`}>
        {expenses.length === 0 ? (
          <EmptyState
            icon={<ReceiptText size={22} />}
            title={`За ${formatMonthLower(monthKey)} операций нет`}
            description="Добавьте расход — он сразу появится у всех участников семьи"
            action={<Button onClick={() => openModal({ type: 'expenseForm' })}>Добавить расход</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<SearchX size={22} />}
            title="Ничего не найдено"
            description={
              query.trim()
                ? `Нет операций с «${query.trim()}» при выбранных фильтрах`
                : 'Под выбранные фильтры не подходит ни одна операция'
            }
            action={
              <Button variant="secondary" onClick={resetAll}>
                Сбросить поиск и фильтры
              </Button>
            }
          />
        ) : (
          <>
            {!hasRestrictions && (
              <p className="text-sm text-ink-2 mb-4">
                {expenses.length} {plural(expenses.length, 'операция', 'операции', 'операций')} на{' '}
                <span className="tabular">{formatCurrency(total)}</span>
              </p>
            )}
            <ExpenseDayGroups expenses={filtered} />
          </>
        )}
      </Card>
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 px-3.5 rounded-full text-sm font-medium border transition-colors inline-flex items-center gap-1.5
        ${active ? 'bg-accent text-white border-accent' : 'bg-surface text-ink border-line-strong hover:border-ink-3'}`}
    >
      {active && <span aria-hidden>✓</span>}
      {children}
    </button>
  );
}
