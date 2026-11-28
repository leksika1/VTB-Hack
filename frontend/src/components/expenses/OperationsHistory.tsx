import { TextButton, TextInput } from '@admiral-ds/react-ui';
import { useMemo, useState } from 'react';
import { Download, Receipt, Search, CloseIcon } from '../ui/icons';
import type { ExpenseCategory } from '../../types';
import { useMonthSummary } from '../../hooks/useMonthSummary';
import { useUIStore } from '../../store/uiStore';
import { useFamilyStore } from '../../store/familyStore';
import { ALL_CATEGORIES, CATEGORIES } from '../../utils/categories';
import { formatCurrency } from '../../utils/currency';
import { formatMonthLower } from '../../utils/date';
import { fuzzyMatch } from '../../utils/search';
import { downloadFile, expensesToCsv } from '../../utils/csv';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ChoiceChip } from '../ui/ChoiceChip';
import { Disclosure } from '../ui/Disclosure';
import { EmptyState } from '../ui/Feedback';
import { ExpenseDayGroups } from './ExpenseList';
import { SpendingCharts } from './SpendingCharts';

export function OperationsHistory({ showCharts = true }: { showCharts?: boolean }) {
  const monthKey = useUIStore((s) => s.monthKey);
  const openModal = useUIStore((s) => s.openModal);
  const family = useFamilyStore((s) => s.family);
  const { expenses } = useMonthSummary();
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [open, setOpen] = useState(false);

  const searched = useMemo(() => expenses.filter((expense) =>
    fuzzyMatch(query, `${expense.title} ${CATEGORIES[expense.category].label}`) !== null), [expenses, query]);
  const filtered = categories.length ? searched.filter((expense) => categories.includes(expense.category)) : searched;
  const restricted = Boolean(query.trim() || categories.length);
  const toggleCategory = (key: ExpenseCategory) => {
    setOpen(true);
    setCategories((prev) => prev.includes(key) ? prev.filter((category) => category !== key) : [...prev, key]);
  };

  return (
    <div className="space-y-5">
      {showCharts && expenses.length > 0 && <SpendingCharts expenses={expenses} selected={categories} onToggle={toggleCategory} />}
      <Card className="px-2 py-2 sm:px-3">
        <Disclosure title={`История операций (${expenses.length})`} open={open} onOpenChange={setOpen}>
          {!expenses.length ? (
            <EmptyState compact icon={<Receipt size={22} />}
              title={`За ${formatMonthLower(monthKey)} операций нет`} />
          ) : (
            <div className="space-y-4 pt-2">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1 input-soft-border">
                  <TextInput value={query} onChange={(event) => setQuery(event.target.value)}
                    placeholder="Поиск" aria-label="Поиск по названию операции" displayClearIcon
                    iconsBefore={<Search size={18} className="ml-2 text-ink-3" aria-hidden />} />
                </div>
                <Button variant="secondary" icon={<Download size={18} />} disabled={!filtered.length}
                  onClick={() => downloadFile(`операции-${monthKey}.csv`, expensesToCsv(filtered, family), 'text/csv;charset=utf-8')}
                  aria-label="Скачать операции в CSV">CSV</Button>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink-2">Категории</legend>
                <div className="flex flex-wrap gap-2">
                  {ALL_CATEGORIES.map((key) => (
                    <ChoiceChip dimension="s" key={key} selected={categories.includes(key)} onClick={() => toggleCategory(key)}>
                      {CATEGORIES[key].label}
                    </ChoiceChip>
                  ))}
                </div>
              </fieldset>
              {restricted && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                  <span>Найдено {filtered.length} из {expenses.length} на сумму{' '}
                    <span className="tabular">{formatCurrency(filtered.reduce((sum, item) => sum + item.amount, 0))}</span>
                  </span>
                  <TextButton type="button" dimension="s" iconStart={<CloseIcon size={16} />} text="Сбросить"
                    onClick={() => { setQuery(''); setCategories([]); }} />
                </div>
              )}
              {filtered.length ? <ExpenseDayGroups expenses={filtered} /> : <p className="text-ink-2">Операции не найдены.</p>}
              <Button size="sm" variant="secondary" onClick={() => openModal({ type: 'expenseForm' })}>Записать покупку</Button>
            </div>
          )}
        </Disclosure>
      </Card>
    </div>
  );
}
