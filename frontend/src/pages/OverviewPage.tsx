import { ArrowRight, CalendarClock, ReceiptText, UserPlus } from 'lucide-react';
import { problemCategories } from '../domain/budget';
import { useMonthSummary } from '../hooks/useMonthSummary';
import { useUIStore } from '../store/uiStore';
import { useFamilyStore } from '../store/familyStore';
import { formatMonthLower } from '../utils/date';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { Avatar, MonthSwitcher } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Feedback';
import { MonthCarousel } from '../components/budget/MonthCarousel';
import { CategoryList } from '../components/budget/CategoryList';
import { ExpenseList } from '../components/expenses/ExpenseList';
import { PaymentList } from '../components/payments/PaymentList';

const RECENT_LIMIT = 5;
const PAYMENTS_LIMIT = 3;

export function OverviewPage() {
  const monthKey = useUIStore((s) => s.monthKey);
  const openModal = useUIStore((s) => s.openModal);
  const setTab = useUIStore((s) => s.setTab);
  const summary = useMonthSummary();
  const problems = problemCategories(summary).slice(0, 3);
  const recent = summary.expenses.slice(0, RECENT_LIMIT);

  const payments = <UpcomingPaymentsCard />;

  return (
    <>
      <PageHeader title="Обзор">
        <MonthSwitcher />
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] items-start">
        <div className="space-y-5 min-w-0">
          <MonthCarousel />

          {/* Month-dependent blocks fade in while the main block slides */}
          <div key={monthKey} className="space-y-5 animate-month-in">
            {summary.hasBudget && (
              <Card className="p-5">
                <SectionHeader
                  title="Требует внимания"
                  action={
                    <Button size="sm" variant="ghost" onClick={() => setTab('plan')} icon={<ArrowRight size={16} />} className="flex-row-reverse">
                      Все
                    </Button>
                  }
                />
                {problems.length > 0 ? (
                  <CategoryList categories={problems} />
                ) : (
                  <p className="text-ink-2">Все категории в пределах лимитов, с учётом предстоящих платежей.</p>
                )}
              </Card>
            )}

            <div className="lg:hidden">{payments}</div>

            <Card className="p-5">
              <SectionHeader
                title="Последние операции"
                action={
                  summary.expenses.length > RECENT_LIMIT && (
                    <Button size="sm" variant="ghost" onClick={() => setTab('operations')} icon={<ArrowRight size={16} />} className="flex-row-reverse">
                      Все
                    </Button>
                  )
                }
              />
              {recent.length > 0 ? (
                <ExpenseList expenses={recent} showDate />
              ) : (
                <EmptyState
                  compact
                  icon={<ReceiptText size={22} />}
                  title="Расходов пока нет"
                  description={`Добавьте первую покупку за ${formatMonthLower(monthKey)} — она сразу уменьшит свободную сумму`}
                  action={
                    <Button variant="secondary" onClick={() => openModal({ type: 'expenseForm' })}>
                      Добавить расход
                    </Button>
                  }
                />
              )}
            </Card>
          </div>
        </div>

        <aside className="space-y-5 min-w-0">
          <div key={monthKey} className="hidden lg:block animate-month-in">{payments}</div>
          <FamilyStatusCard />
        </aside>
      </div>
    </>
  );
}

function UpcomingPaymentsCard() {
  const setTab = useUIStore((s) => s.setTab);
  const openModal = useUIStore((s) => s.openModal);
  const summary = useMonthSummary();
  const upcoming = summary.upcomingPayments.slice(0, PAYMENTS_LIMIT);

  return (
    <Card className="p-5">
      <SectionHeader
        title="Ближайшие платежи"
        action={
          <Button size="sm" variant="ghost" onClick={() => setTab('plan')} icon={<ArrowRight size={16} />} className="flex-row-reverse">
            Все
          </Button>
        }
      />
      {upcoming.length > 0 ? (
        <PaymentList payments={upcoming} />
      ) : (
        <EmptyState
          compact
          icon={<CalendarClock size={22} />}
          title="Предстоящих платежей нет"
          description="Добавьте аренду, коммунальные услуги или кружки — их сумма будет зарезервирована"
          action={
            <Button variant="secondary" onClick={() => openModal({ type: 'paymentForm' })}>
              Добавить платёж
            </Button>
          }
        />
      )}
    </Card>
  );
}

function FamilyStatusCard() {
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const openModal = useUIStore((s) => s.openModal);
  if (!family) return null;
  const alone = family.members.length === 1;

  return (
    <Card className="p-5">
      <SectionHeader title="Семья" />
      <ul className="space-y-2.5">
        {family.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <Avatar user={m} size="sm" />
            <span className="flex-1 min-w-0 truncate text-ink">{m.name}</span>
            {m.id === currentUserId && <span className="text-sm text-ink-3">это вы</span>}
          </li>
        ))}
      </ul>
      {alone && (
        <div className="mt-4 p-4 rounded-xl bg-accent-soft">
          <p className="text-[15px] text-ink">Пока вы ведёте бюджет один. Пригласите партнёра, чтобы планировать вместе.</p>
          <Button className="mt-3" size="sm" icon={<UserPlus size={16} />} onClick={() => openModal({ type: 'invite' })}>
            Пригласить
          </Button>
        </div>
      )}
    </Card>
  );
}
