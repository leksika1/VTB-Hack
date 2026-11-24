import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Download, Plus, Receipt, Search, Tune, CloseIcon } from '../components/ui/icons';
import type { ExpenseCategory } from '../types';
import { useMonthSummary } from '../hooks/useMonthSummary';
import { useMonthChanged } from '../hooks/useMonthChanged';
import { useUIStore } from '../store/uiStore';
import { useFamilyStore, useIsParent } from '../store/familyStore';
import { useDataStore } from '../store/dataStore';
import { ALL_CATEGORIES, CATEGORIES } from '../utils/categories';
import { formatCurrency } from '../utils/currency';
import { formatMonthLower, plural } from '../utils/date';
import { fuzzyMatch } from '../utils/search';
import { downloadFile, expensesToCsv } from '../utils/csv';
import { Card, PageHeader } from '../components/ui/Card';
import { MonthSwitcher } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { ChoiceChip } from '../components/ui/ChoiceChip';
import { EmptyState } from '../components/ui/Feedback';
import { ExpenseDayGroups } from '../components/expenses/ExpenseList';
import { SpendingCharts } from '../components/expenses/SpendingCharts';
import { TextButton, TextInput } from '@admiral-ds/react-ui';

export function OperationsPage() {
  const monthKey = useUIStore((s) => s.monthKey);
  const openModal = useUIStore((s) => s.openModal);
  const addToast = useUIStore((s) => s.addToast);
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const { expenses, spent } = useMonthSummary();
  const isParent = useIsParent();
  const contributions = useDataStore((s) => s.accountContributions);
  const contributed = contributions.reduce((sum, item) => item.date.startsWith(monthKey) ? sum + item.amount : sum, 0);
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
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
          <div className="max-sm:w-full"><MonthSwitcher /></div>
          {filtered.length > 0 && (
            <Button
              variant="secondary"
              icon={<Download size={18} />}
              onClick={exportCsv}
              aria-label={hasRestrictions ? 'Скачать найденные операции в CSV' : 'Скачать операции месяца в CSV'}
              title="Скачать CSV для Excel"
              size="sm"
            >
              CSV
            </Button>
          )}
          <Button
            variant="primary"
            icon={<Plus size={20} />}
            onClick={() => openModal({ type: 'expenseForm' })}
            aria-label="Добавить расход"
            size="sm"
          >
            Добавить
          </Button>
        </div>
      </PageHeader>

      <Card tone="brand" className="mb-4 p-5 sm:p-6">
        <div key={monthKey} className={monthIn}>
          <h2 className="text-sm font-medium text-ink-2">{hasRestrictions ? 'Расходы по фильтру' : 'Расходы за месяц'}</h2>
          <p className="balance-number mt-1">{formatCurrency(total)}</p>
          {isParent && (
            <dl className="account-metrics !grid-cols-2">
              <div>
                <dt className="flex items-center gap-1.5"><ArrowLeft size={15} /> Пополнения счёта</dt>
                <dd>{formatCurrency(contributed)}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5"><ArrowRight size={15} /> Все расходы месяца</dt>
                <dd>{formatCurrency(spent)}</dd>
              </div>
            </dl>
          )}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex gap-2.5">
          <div className="min-w-0 flex-1 input-soft-border">
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск"
              aria-label="Поиск по названию операции"
              iconsBefore={<Search size={18} className="text-ink-3 ml-2" aria-hidden />}
              displayClearIcon
            />
          </div>
          <Button
            variant={activeFilters > 0 ? 'primary' : 'secondary'}
            icon={<Tune size={18} />}
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
                    <ChoiceChip dimension="s" key={key} selected={categories.includes(key)} onClick={() => toggleCategory(key)}>
                      {CATEGORIES[key].label}
                    </ChoiceChip>
                  ))}
                </div>
              </fieldset>
              {family && family.members.length > 1 && (
                <fieldset>
                  <legend className="text-sm font-medium text-ink-2 mb-2">Кто добавил</legend>
                  <div className="flex flex-wrap gap-2">
                    <ChoiceChip dimension="s" selected={author === null} onClick={() => setAuthor(null)}>
                      Все
                    </ChoiceChip>
                    {family.members.map((m) => (
                      <ChoiceChip dimension="s" key={m.id} selected={author === m.id} onClick={() => setAuthor(m.id)}>
                        {m.id === currentUserId ? `${m.name} (вы)` : m.name}
                      </ChoiceChip>
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
            <TextButton type="button" dimension="s" iconStart={<CloseIcon size={16} />} text="Сбросить" onClick={resetAll} />
          </div>
        )}
      </Card>

      <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card key={`list-${monthKey}`} className={`p-4 sm:p-5 ${monthIn}`}>
          {expenses.length === 0 ? (
            <EmptyState
              icon={<Receipt size={22} />}
              title={`За ${formatMonthLower(monthKey)} операций нет`}
              description="Добавьте расход — он сразу появится у всех участников семьи"
              action={<Button onClick={() => openModal({ type: 'expenseForm' })}>Добавить расход</Button>}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Search size={22} />}
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
              <h2 className="mb-4 text-xl font-semibold">История операций</h2>
              <ExpenseDayGroups expenses={filtered} />
            </>
          )}
        </Card>
        {searched.length > 0 && (
          <SpendingCharts key={`charts-${monthKey}`} expenses={searched} selected={categories} onToggle={toggleCategory} className={monthIn} />
        )}
      </div>
    </>
  );
}
