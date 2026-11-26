import { useMemo } from 'react';
import { computeAccountHistory } from '../../domain/familyAccount';
import { useDataStore } from '../../store/dataStore';
import { formatBalance, formatCurrency, formatSigned } from '../../utils/currency';
import { formatMonthKey } from '../../utils/date';
import { Card, SectionHeader } from '../ui/Card';

export function AccountHistory({ month }: { month: string }) {
  const expenses = useDataStore((state) => state.expenses);
  const contributions = useDataStore((state) => state.accountContributions);
  const rows = useMemo(() => computeAccountHistory(month, expenses, contributions), [month, expenses, contributions]);
  const showLegacy = rows.some((row) => row.legacy);

  return (
    <Card className="p-5">
      <SectionHeader title="Динамика по счетам" subtitle="Изменение расходов к предыдущему месяцу и остаток общего счёта" />
      <ul className="grid gap-3 md:grid-cols-3">
        {rows.map((row) => (
          <li key={row.month} className="min-w-0 rounded-control bg-surface-muted p-3 sm:p-4">
            <h3 className="font-semibold">{formatMonthKey(row.month)}</h3>
            <dl className="mt-2 space-y-2 text-sm">
              <HistoryRow label="Общие расходы" amount={row.shared} change={row.sharedChange} />
              <HistoryRow label="Личные расходы" amount={row.personal} change={row.personalChange} />
              {showLegacy && <HistoryRow label="Без источника" amount={row.legacy} />}
              <div className="flex flex-wrap justify-between gap-x-2 border-t border-line pt-2">
                <dt className="text-ink-2">Остаток счёта</dt>
                <dd className="font-semibold tabular">{row.balance === null ? '—' : formatBalance(row.balance)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function HistoryRow({ label, amount, change }: { label: string; amount: number | null; change?: number | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-right font-medium tabular">
        {amount === null ? '—' : formatCurrency(amount)}
        {change != null && <span className="block text-xs font-normal text-ink-3">{formatSigned(change)}</span>}
      </dd>
    </div>
  );
}
