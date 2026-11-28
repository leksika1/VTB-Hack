import { useState } from 'react';
import { T } from '@admiral-ds/react-ui';
import type { Payment } from '../types';
import { useCalendar } from '../hooks/useServerData';
import { useUIStore } from '../store/uiStore';
import { formatBalance, formatCurrency } from '../utils/currency';
import { formatDateShort, todayISO } from '../utils/date';
import { ExpenseList } from '../components/expenses/ExpenseList';
import { PaymentList } from '../components/payments/PaymentList';
import { Button } from '../components/ui/Button';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { ErrorState, Skeleton } from '../components/ui/Feedback';
import { Refresh } from '../components/ui/icons';
import { AmountRow, MonthSwitcher } from '../components/ui/Misc';

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function CalendarPage() {
  const month = useUIStore((state) => state.monthKey);
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
  const calendar = useCalendar(month);

  if (!calendar.data && calendar.loading) return <CalendarSkeleton />;
  if (!calendar.data && calendar.error) {
    return (
      <Card className="p-5">
        <ErrorState message={calendar.error} retrying={calendar.loading}
          onRetry={() => void calendar.refetch()} />
      </Card>
    );
  }
  if (!calendar.data) return null;

  const selectedDay = calendar.data.days.find((day) => day.date === selected) ?? calendar.data.days[0];
  const isPast = selected < today;
  const upcoming = isPast ? [] : calendar.data.upcomingPayments.filter((payment) =>
    payment.status === 'upcoming' && payment.dueDate >= selected && payment.dueDate.startsWith(month));
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const byDate = new Map(calendar.data.days.map((day) => [day.date, day]));

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      {calendar.error && (
        <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:col-span-2" tone="accent">
          <p role="alert" className="text-sm text-ink">Не удалось обновить календарь.</p>
          <Button size="sm" variant="secondary" icon={<Refresh size={15} />}
            loading={calendar.loading} onClick={() => void calendar.refetch()}>Повторить</Button>
        </Card>
      )}

      <Card className="min-w-0 p-3 sm:p-5">
        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdays.map((day) => <span key={day} className="pb-2 text-sm text-ink-2">{day}</span>)}
          {Array.from({ length: offset }, (_, index) => <span key={`empty-${index}`} aria-hidden />)}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const dayNumber = index + 1;
            const date = `${month}-${String(dayNumber).padStart(2, '0')}`;
            const day = byDate.get(date);
            const hasPayment = Boolean(day?.payments.length);
            const hasExpense = Boolean(day?.expenses.length);
            return (
              <Button key={date} variant={date === selected ? 'primary' : 'secondary'} size="sm"
                className="calendar-day !px-0" aria-pressed={date === selected}
                aria-current={date === today ? 'date' : undefined}
                aria-label={`${formatDateShort(date)}${hasExpense ? `, траты ${formatCurrency(day?.expenseTotal ?? 0)}` : ''}${hasPayment ? ', есть платежи' : ''}`}
                onClick={() => setSelected(date)}>
                <span className="grid place-items-center gap-0.5">
                  <span>{dayNumber}</span>
                  <span className="flex h-0.5 gap-0.5" aria-hidden>
                    {hasExpense && <span className="calendar-expense h-full w-2 rounded-full" />}
                    {hasPayment && <span className="calendar-payment h-full w-2 rounded-full" />}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      </Card>

      {selectedDay && (
        <Card className="min-w-0 p-5">
          <div className="rounded-control bg-surface-muted p-4" aria-live="polite">
            <T as="h2" font="Header/H5">Остаток на счёте на {formatDateShort(selectedDay.date)}</T>
            <T as="p" font="Header/H4"
              className={`mt-2 tabular wrap-anywhere ${selectedDay.accountBalance < 0 ? 'text-danger' : 'text-ink'}`}>
              {formatBalance(selectedDay.accountBalance)}
            </T>
            <p className="mt-1 text-sm text-ink-2">Остаток на конец выбранного дня</p>
          </div>

          <div key={selectedDay.date} className="mt-5 animate-fade-in space-y-5">
            <section aria-labelledby="calendar-expenses-title">
              <SectionHeader id="calendar-expenses-title" title={`Траты ${formatDateShort(selectedDay.date)}`}
                subtitle={selectedDay.expenses.length > 0 ? formatCurrency(selectedDay.expenseTotal) : undefined} />
              {selectedDay.expenses.length > 0
                ? <ExpenseList expenses={selectedDay.expenses} />
                : <p className="text-sm text-ink-2">В этот день трат не было</p>}
            </section>

            {selectedDay.payments.length > 0 && (
              <section className="border-t border-line pt-4" aria-labelledby="calendar-day-payments-title">
                <SectionHeader id="calendar-day-payments-title" title={`Платежи ${formatDateShort(selectedDay.date)}`}
                  subtitle={formatCurrency(sumPayments(selectedDay.payments))} />
                <PaymentList payments={selectedDay.payments} />
              </section>
            )}
          </div>
        </Card>
      )}

      {!isPast && (
        <Card className="min-w-0 p-5 lg:col-span-2">
          <SectionHeader title="Платежи до конца месяца" />
          {upcoming.length > 0 ? (
            <>
              <PaymentList payments={upcoming} />
              <div className="mt-3 border-t border-line pt-2">
                <AmountRow label="Всего к оплате" value={formatCurrency(sumPayments(upcoming))} strong />
              </div>
            </>
          ) : <p className="text-sm text-ink-2">До конца месяца платежей нет</p>}
        </Card>
      )}
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-2" aria-label="Загрузка календаря" aria-busy="true">
      <Skeleton className="h-80 w-full rounded-[var(--radius-card)]" />
      <Skeleton className="h-80 w-full rounded-[var(--radius-card)]" />
    </div>
  );
}

function sumPayments(payments: Payment[]): number {
  return payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0) / 100;
}
