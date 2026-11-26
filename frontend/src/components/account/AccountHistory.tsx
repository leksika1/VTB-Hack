import { useId, useMemo, useState } from 'react';
import { SegmentedControl, SegmentedControlItem } from '@admiral-ds/react-ui';
import { computeAccountHistory } from '../../domain/familyAccount';
import { useDataStore } from '../../store/dataStore';
import { formatBalance } from '../../utils/currency';
import { formatMonthKey, parseISODate } from '../../utils/date';
import { Card, SectionHeader } from '../ui/Card';

const ACCOUNTS = [
  { key: 'shared', label: 'Общий счёт', color: 'bg-accent' },
  { key: 'personal', label: 'Личные карты', color: 'bg-[var(--cat-kids)]' },
  { key: 'legacy', label: 'Без источника', color: 'bg-[var(--cat-other)]' },
] as const;
const BALANCE = [{ key: 'balance', label: 'Остаток общего счёта', color: 'bg-accent' }] as const;
const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
const monthLabel = new Intl.DateTimeFormat('ru-RU', { month: 'short', year: '2-digit' });

export function AccountHistory({ month }: { month: string }) {
  const expenses = useDataStore((state) => state.expenses);
  const contributions = useDataStore((state) => state.accountContributions);
  const rows = useMemo(() => computeAccountHistory(month, expenses, contributions), [month, expenses, contributions]);
  const [metric, setMetric] = useState<'expenses' | 'balance'>('expenses');
  const [selected, setSelected] = useState<string>();
  const name = useId();
  const series = metric === 'balance' ? BALANCE : ACCOUNTS.filter(({ key }) => key !== 'legacy' || rows.some((row) => row.legacy));
  const values = rows.flatMap((row) => series.map(({ key }) => row[key] ?? 0));
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values) || (minimum === 0 ? 1 : 0);
  const range = maximum - minimum;
  const position = (value: number) => `${(value - minimum) / range * 100}%`;
  const levels = [...new Set([minimum, 0, maximum])];
  const active = rows.find((row) => row.month === selected) ?? rows.at(-1);

  return (
    <Card className="p-5">
      <SectionHeader title="Динамика по счетам" action={
        <SegmentedControl dimension="s" appearance="filled" aria-label="Метрика по счетам">
          <SegmentedControlItem name={name} value="expenses" checked={metric === 'expenses'} onChange={() => setMetric('expenses')}>
            Расходы
          </SegmentedControlItem>
          <SegmentedControlItem name={name} value="balance" checked={metric === 'balance'} onChange={() => setMetric('balance')}>
            Остаток
          </SegmentedControlItem>
        </SegmentedControl>
      } />
      <figure aria-label={metric === 'expenses' ? 'Расходы по счетам за три месяца' : 'Остаток общего счёта за три месяца'}>
        <div className="relative ml-10 mt-6 sm:ml-16">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40" aria-hidden>
            {levels.map((level) => (
              <div key={level} className={`absolute inset-x-0 border-t ${level === 0 ? 'border-line-strong' : 'border-dashed border-line'}`}
                style={{ bottom: position(level) }}>
                <span className="absolute right-full top-0 mr-1 -translate-y-1/2 whitespace-nowrap text-[10px] text-ink-3 sm:mr-2 sm:text-xs">
                  {compact.format(level)}
                </span>
              </div>
            ))}
          </div>
          <div className="relative grid grid-cols-3 gap-1 sm:gap-3">
            {rows.map((row) => (
              <button key={row.month} type="button" aria-pressed={active?.month === row.month}
                aria-label={[formatMonthKey(row.month), ...series.map(({ key, label }) => `${label}: ${row[key] === null ? 'нет данных' : formatBalance(row[key])}`)].join(', ')}
                onClick={() => setSelected(row.month)}
                className="min-w-0 rounded-control pb-2 text-center transition-colors hover:bg-surface-muted aria-pressed:bg-accent-soft/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <span className="flex h-40 justify-center gap-1.5 px-2 sm:gap-2" aria-hidden>
                  {series.map(({ key, color }) => {
                    const amount = row[key];
                    return (
                      <span key={key} className="relative w-full max-w-10">
                        {amount !== null && amount !== 0 && (
                          <span className={`absolute inset-x-0 rounded-sm ${amount < 0 ? 'bg-danger' : color}`}
                            style={{ height: `${Math.abs(amount) / range * 100}%`, bottom: position(Math.min(0, amount)) }} />
                        )}
                      </span>
                    );
                  })}
                </span>
                <span className="mt-2 block text-xs font-medium text-ink-2 sm:text-sm">
                  {monthLabel.format(parseISODate(`${row.month}-01`))}
                </span>
              </button>
            ))}
          </div>
        </div>
        {active && (
          <figcaption className="mt-4 rounded-control bg-surface-muted p-3 sm:p-4">
            <p className="mb-2 text-sm font-semibold">{formatMonthKey(active.month)}</p>
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {series.map(({ key, label, color }) => (
                <div key={key} className="min-w-0">
                  <dt className="flex items-center gap-2 text-xs text-ink-2 sm:text-sm">
                    <span className={`size-2.5 shrink-0 rounded-sm ${active[key] !== null && active[key] < 0 ? 'bg-danger' : color}`} aria-hidden />
                    {label}
                  </dt>
                  <dd className="pl-[18px] text-sm font-semibold tabular">{active[key] === null ? '—' : formatBalance(active[key])}</dd>
                </div>
              ))}
            </dl>
          </figcaption>
        )}
      </figure>
    </Card>
  );
}
