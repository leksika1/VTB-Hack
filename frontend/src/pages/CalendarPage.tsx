import { useMemo, useRef, useState } from 'react';
import { T } from '@admiral-ds/react-ui';
import { computeAccountAtDate, plannedSharedExpensesThrough } from '../domain/familyAccount';
import { useMonthSummary } from '../hooks/useMonthSummary';
import { useDataStore } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import type { Payment } from '../types';
import { formatBalance, formatCurrency } from '../utils/currency';
import { formatDateShort, plural, todayISO } from '../utils/date';
import { PaymentList } from '../components/payments/PaymentList';
import { ExpenseList } from '../components/expenses/ExpenseList';
import { Button } from '../components/ui/Button';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { MonthSwitcher } from '../components/ui/Misc';
import { ChevronRight } from '../components/ui/icons';

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function CalendarPage() {
  const month = useUIStore((s) => s.monthKey);
  return (
    <>
      <PageHeader title="Календарь"><MonthSwitcher /></PageHeader>
      <MonthCalendar key={month} month={month} />
    </>
  );
}

function MonthCalendar({ month }: { month: string }) {
  const today = todayISO();
  const [selected, setSelected] = useState(today.startsWith(month) ? today : `${month}-01`);
  const dayDetails = useRef<HTMLDivElement>(null);
  const summary = useMonthSummary(month);
  const expenses = useDataStore((s) => s.expenses);
  const payments = useDataStore((s) => s.payments);
  const contributions = useDataStore((s) => s.accountContributions);
  const paidDates = useMemo(() => new Map(expenses.flatMap((expense) =>
    expense.paymentId ? [[expense.paymentId, expense.date] as const] : [])), [expenses]);
  const paymentDate = (payment: Payment) => payment.status === 'paid' ? paidDates.get(payment.id) ?? payment.dueDate : payment.dueDate;
  const paymentsOnDay = payments.filter((payment) => paymentDate(payment) === selected);
  const standaloneExpenses = summary.expenses.filter((expense) => !expense.paymentId);
  const expensesOnDay = standaloneExpenses.filter((expense) => expense.date === selected);
  const daysWithPayments = new Set(payments.map(paymentDate));
  const daysWithExpenses = new Set(standaloneExpenses.map((expense) => expense.date));
  const isForecast = selected >= today;
  const planned = isForecast ? plannedSharedExpensesThrough(selected, payments) : 0;
  const recordedBalance = computeAccountAtDate(selected, expenses, contributions);
  const remaining = (Math.round(recordedBalance * 100) - Math.round(planned * 100)) / 100;
  const [year, monthNumber] = month.split('-').map(Number);
  const days = new Date(year, monthNumber, 0).getDate();
  const offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card className="min-w-0 p-3 sm:p-5">
        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdays.map((day) => <span key={day} className="pb-2 text-sm text-ink-2">{day}</span>)}
          {Array.from({ length: offset }, (_, index) => <span key={`empty-${index}`} aria-hidden />)}
          {Array.from({ length: days }, (_, index) => {
            const day = index + 1;
            const date = `${month}-${String(day).padStart(2, '0')}`;
            const hasPayment = daysWithPayments.has(date);
            const hasExpense = daysWithExpenses.has(date);
            return (
              <Button key={date} variant={date === selected ? 'primary' : 'secondary'}
                size="sm" className="calendar-day !px-0" aria-pressed={date === selected} aria-current={date === today ? 'date' : undefined}
                aria-label={`${formatDateShort(date)}${hasPayment ? ', есть платежи' : ''}${hasExpense ? ', есть расходы' : ''}`}
                onClick={() => setSelected(date)}>
                <span className="grid place-items-center gap-0.5">
                  <span>{day}</span>
                  <span className="flex h-0.5 gap-0.5" aria-hidden>
                    {hasPayment && <span className="calendar-payment h-full w-2 rounded-full" />}
                    {hasExpense && <span className="calendar-expense h-full w-2 rounded-full" />}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      </Card>
      <Card className="min-w-0 space-y-4 p-5">
        <div ref={dayDetails} tabIndex={-1} className="scroll-mt-24 rounded-control bg-surface-muted p-4" aria-live="polite">
          <T as="h2" font="Header/H5">{formatDateShort(selected)}</T>
          <p className="mt-3 text-sm text-ink-2">{isForecast ? 'Прогноз остатка на общем счёте' : 'Остаток на общем счёте'}</p>
          <T as="p" font="Header/H4" className={`mt-1 tabular wrap-anywhere ${remaining < 0 ? 'text-danger' : 'text-ink'}`}>
            {formatBalance(remaining)}
          </T>
          {isForecast && (
            <p className="mt-1 text-sm text-ink-2">
              {planned > 0
                ? `Учтены платежи с общего счёта на ${formatCurrency(planned)}, включая просроченные.`
                : 'К этой дате нет запланированных платежей с общего счёта.'}
            </p>
          )}
        </div>
        <div key={selected} className="animate-fade-in space-y-4">
          {paymentsOnDay.length > 0 && (
            <>
              <T as="h3" font="Subtitle/Subtitle 2">Платежи на {formatCurrency(sumPayments(paymentsOnDay))}</T>
              <PaymentList payments={paymentsOnDay} paidDates={paidDates} />
            </>
          )}
          {expensesOnDay.length > 0 && (
            <>
              <T as="h3" font="Subtitle/Subtitle 2">Расходы на {formatCurrency(expensesOnDay.reduce((sum, item) => sum + item.amount, 0))}</T>
              <ExpenseList expenses={expensesOnDay} />
            </>
          )}
          {!paymentsOnDay.length && !expensesOnDay.length && (
            <T as="p" font="Body/Body 2 Short" color="Neutral/Neutral 70">На этот день нет платежей и расходов</T>
          )}
        </div>
      </Card>
      <UpcomingMonth payments={summary.upcomingPayments} selected={selected} today={today} onSelect={(date) => {
        setSelected(date);
        dayDetails.current?.focus({ preventScroll: true });
        dayDetails.current?.scrollIntoView({ block: 'nearest' });
      }} />
    </div>
  );
}

function sumPayments(payments: Payment[]) {
  return payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0) / 100;
}

function UpcomingMonth({ payments, selected, today, onSelect }: {
  payments: Payment[];
  selected: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  const byDay = new Map<string, Payment[]>();
  for (const payment of payments) {
    const items = byDay.get(payment.dueDate);
    if (items) items.push(payment);
    else byDay.set(payment.dueDate, [payment]);
  }

  return (
    <Card className="min-w-0 p-5 lg:col-span-2">
      <SectionHeader title="Запланированные платежи за месяц" subtitle={payments.length > 0
        ? `${payments.length} ${plural(payments.length, 'платёж', 'платежа', 'платежей')} на ${formatCurrency(sumPayments(payments))}`
        : 'Неоплаченных платежей за этот месяц нет'} />
      {payments.length > 0 && (
        <ul className="divide-y divide-line">
          {[...byDay].map(([date, items]) => (
            <li key={date}>
              <T as="button" type="button" font="Body/Body 2 Short"
                aria-pressed={selected === date}
                onClick={() => onSelect(date)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-control px-2 py-3 text-left hover:bg-surface-muted aria-pressed:bg-surface-muted">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">
                    {formatDateShort(date)}{date < today && <span className="ml-2 text-xs font-medium text-danger">Просрочено</span>}
                  </span>
                  <span className="mt-1 block wrap-anywhere text-ink-2">{items.map(({ title }) => title).join(', ')}</span>
                </span>
                <span className="flex items-center gap-1 font-semibold tabular text-ink">
                  {formatCurrency(sumPayments(items))}<ChevronRight size={16} className="shrink-0 text-ink-3" aria-hidden />
                </span>
              </T>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
