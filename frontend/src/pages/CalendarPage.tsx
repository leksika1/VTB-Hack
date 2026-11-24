import { useState } from 'react';
import { T } from '@admiral-ds/react-ui';
import { useMonthSummary } from '../hooks/useMonthSummary';
import { useUIStore } from '../store/uiStore';
import { formatCurrency } from '../utils/currency';
import { formatDateShort, todayISO } from '../utils/date';
import { PaymentList } from '../components/payments/PaymentList';
import { ExpenseList } from '../components/expenses/ExpenseList';
import { Button } from '../components/ui/Button';
import { Card, PageHeader } from '../components/ui/Card';
import { MonthSwitcher } from '../components/ui/Misc';

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
  const summary = useMonthSummary(month);
  const payments = [...summary.upcomingPayments, ...summary.paidPayments];
  const paymentsOnDay = payments.filter((item) => item.dueDate === selected);
  const expensesOnDay = summary.expenses.filter((item) => item.date === selected && !item.paymentId);
  const daysWithPayments = new Set(payments.map((item) => item.dueDate));
  const daysWithExpenses = new Set(summary.expenses.filter((item) => !item.paymentId).map((item) => item.date));
  const [year, monthNumber] = month.split('-').map(Number);
  const days = new Date(year, monthNumber, 0).getDate();
  const offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card className="p-3 sm:p-5">
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
        <div className="rounded-control bg-surface-muted p-4" aria-live="polite">
          <T as="h2" font="Header/H5">{formatDateShort(selected)}</T>
          {paymentsOnDay.length > 0 && (
            <p className="pt-1 text-sm text-ink-2">
              Платежи на {formatCurrency(paymentsOnDay.reduce((sum, item) => sum + item.amount, 0))}
            </p>
          )}
        </div>
        <div key={selected} className="animate-fade-in space-y-4">
          {paymentsOnDay.length > 0 && <PaymentList payments={paymentsOnDay} />}
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
    </div>
  );
}
