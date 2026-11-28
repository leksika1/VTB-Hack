import { useState } from 'react';
import type { AnalyticsCategory, AnalyticsMonth, Payment } from '../types';
import { useAnalytics } from '../hooks/useServerData';
import { useUIStore } from '../store/uiStore';
import { CATEGORIES } from '../utils/categories';
import { formatBalance, formatCurrency } from '../utils/currency';
import { formatMonthLower } from '../utils/date';
import { FamilyContributionsCard } from '../components/account/FamilyAccountCard';
import { OperationsHistory } from '../components/expenses/OperationsHistory';
import { GoalsCard } from '../components/goals/GoalsCard';
import { PaymentList } from '../components/payments/PaymentList';
import { Button } from '../components/ui/Button';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { ChoiceChip } from '../components/ui/ChoiceChip';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/Feedback';
import { Calendar, Refresh } from '../components/ui/icons';
import { CategoryIcon, MonthSwitcher } from '../components/ui/Misc';
import { ProgressBar } from '../components/ui/ProgressBar';

export function AnalyticsPage() {
  const month = useUIStore((state) => state.monthKey);
  const analytics = useAnalytics(month, 6);

  return (
    <>
      <PageHeader title="Аналитика"><MonthSwitcher /></PageHeader>

      {!analytics.data && analytics.loading && <AnalyticsSkeleton />}
      {!analytics.data && analytics.error && (
        <Card className="p-5">
          <ErrorState message={analytics.error} retrying={analytics.loading}
            onRetry={() => void analytics.refetch()} />
        </Card>
      )}

      {analytics.data && (
        <div className="space-y-5">
          {analytics.error && (
            <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" tone="accent">
              <p role="alert" className="text-sm text-ink">Не удалось обновить аналитику.</p>
              <Button size="sm" variant="secondary" icon={<Refresh size={15} />}
                loading={analytics.loading} onClick={() => void analytics.refetch()}>Повторить</Button>
            </Card>
          )}
          <AnalyticsTrend month={month} series={analytics.data.series} />
          <CategoriesCard month={month} categories={analytics.data.categories} />
          <FamilyContributionsCard month={month} summary={analytics.data.account} detailed />
          <PaymentsCard month={month} payments={analytics.data.payments} />
          <GoalsCard />
          <OperationsHistory showCharts={false} />
        </div>
      )}
    </>
  );
}

function AnalyticsTrend({ month, series }: { month: string; series: AnalyticsMonth[] }) {
  const setMonth = useUIStore((state) => state.setMonthKey);
  const [metric, setMetric] = useState<'expenses' | 'accountBalance'>('expenses');
  const selected = series.find((item) => item.month === month) ?? series.at(-1);
  const selectedIndex = selected ? series.indexOf(selected) : -1;
  const previous = selectedIndex > 0 ? series[selectedIndex - 1] : undefined;
  const values = series.map((item) => item[metric]);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const range = maximum - minimum || 1;
  const zero = ((0 - minimum) / range) * 100;
  const change = metric === 'expenses' && selected && selected.expenseChangePercent !== null && previous
    ? formatExpenseChange(selected.expenseChangePercent, previous.month)
    : null;

  return (
    <Card className="p-5">
      <SectionHeader title="Динамика за 6 месяцев" action={
        <div className="flex flex-wrap gap-2" aria-label="Показатель графика">
          <ChoiceChip dimension="s" selected={metric === 'expenses'} onClick={() => setMetric('expenses')}>Траты</ChoiceChip>
          <ChoiceChip dimension="s" selected={metric === 'accountBalance'} onClick={() => setMetric('accountBalance')}>
            Остаток на счёте
          </ChoiceChip>
        </div>
      } />

      {series.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-2">За выбранный период данных нет.</p>
      ) : (
        <figure aria-label={metric === 'expenses' ? 'Траты за шесть месяцев' : 'Остаток на счёте за шесть месяцев'}>
          <div className="relative pt-2">
            <div className="pointer-events-none absolute inset-x-0 top-2 h-40" aria-hidden>
              <span className="absolute inset-x-0 border-t border-line-strong" style={{ bottom: `${zero}%` }} />
            </div>
            <div className="relative grid grid-cols-6 gap-1 sm:gap-3">
              {series.map((item) => {
                const value = item[metric];
                const active = item.month === month;
                const height = Math.abs(value) / range * 100;
                const bottom = value >= 0 ? zero : zero - height;
                return (
                  <button key={item.month} type="button" aria-pressed={active}
                    aria-label={`${formatMonthLower(item.month)}: ${formatBalance(value)}`}
                    onClick={() => setMonth(item.month)}
                    className="min-w-0 rounded-control px-0.5 pb-2 text-center transition-colors hover:bg-surface-muted aria-pressed:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-2">
                    <span className="relative block h-40" aria-hidden>
                      {value !== 0 && (
                        <span className="absolute inset-x-[24%] min-h-0.5 rounded-t-sm transition-[height,bottom,opacity] duration-300 sm:inset-x-[30%]"
                          style={{
                            height: `${height}%`,
                            bottom: `${bottom}%`,
                            background: value < 0 ? 'var(--danger)' : 'var(--accent)',
                            opacity: active ? 1 : 0.48,
                          }} />
                      )}
                    </span>
                    <span className={`mt-2 block truncate text-xs sm:text-sm ${active ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                      {shortMonth(item.month)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {selected && (
            <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-control bg-surface-muted px-3 py-2">
              <span className="text-sm text-ink-2">{formatMonthLower(selected.month)}</span>
              <span className="font-semibold tabular text-ink">{formatBalance(selected[metric])}</span>
              {change && <span className={change.startsWith('+') ? 'text-danger' : 'text-success'}>{change}</span>}
            </figcaption>
          )}
        </figure>
      )}
    </Card>
  );
}

function CategoriesCard({ month, categories }: { month: string; categories: AnalyticsCategory[] }) {
  return (
    <Card className="p-5">
      <SectionHeader title="Категории" subtitle={`Траты за ${formatMonthLower(month)}`} />
      {categories.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-2">В этом месяце трат не было.</p>
      ) : (
        <ul className="divide-y divide-line">
          {categories.map((category) => {
            const config = CATEGORIES[category.category];
            return (
              <li key={category.category} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <CategoryIcon category={category.category} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="font-medium text-ink">{config.label}</span>
                      <span className="text-sm tabular text-ink-2">
                        {formatCurrency(category.amount)} · {formatPercent(category.percent)}
                      </span>
                    </div>
                    <div className="mt-2">
                      <ProgressBar size="sm" value={category.percent} max={100}
                        label={`${config.label}: ${formatPercent(category.percent)}`} />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PaymentsCard({ month, payments }: { month: string; payments: Payment[] }) {
  return (
    <Card className="p-5">
      <SectionHeader title="Платежи месяца" subtitle={payments.length > 0 ? formatMonthLower(month) : undefined} />
      {payments.length > 0
        ? <PaymentList payments={payments} />
        : <EmptyState compact icon={<Calendar size={22} />} title="Платежей в этом месяце нет" />}
    </Card>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-5" aria-label="Загрузка аналитики" aria-busy="true">
      <Skeleton className="h-72 w-full rounded-[var(--radius-card)]" />
      <Skeleton className="h-52 w-full rounded-[var(--radius-card)]" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />
      </div>
    </div>
  );
}

const SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DATIVE_MONTHS = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню', 'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю'];
const percent = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

function shortMonth(month: string): string {
  return SHORT_MONTHS[Number(month.slice(5, 7)) - 1];
}

function formatPercent(value: number): string {
  return `${percent.format(value)}%`;
}

function formatExpenseChange(value: number, previousMonth: string): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const month = DATIVE_MONTHS[Number(previousMonth.slice(5, 7)) - 1];
  return `${sign}${formatPercent(Math.abs(value))} к ${month}`;
}
