import { FamilyAccountCard } from '../components/account/FamilyAccountCard';
import { ArrowRight, Calendar, Receipt, PersonAdd } from '../components/ui/icons';
import { problemCategories } from '../domain/budget';
import { useMonthSummary } from '../hooks/useMonthSummary';
import { useMonthChanged } from '../hooks/useMonthChanged';
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
import { SpendingStructure } from '../components/budget/SpendingStructure';
import { GoalsCard } from '../components/goals/GoalsCard';

const RECENT_LIMIT = 5;
const PAYMENTS_LIMIT = 3;

export function OverviewPage() {
  return <FamilyOverview />;
}
/** Main screen of an active family participant. */
function FamilyOverview() {
  const monthKey = useUIStore((s) => s.monthKey);
  const openModal = useUIStore((s) => s.openModal);
  const setTab = useUIStore((s) => s.setTab);
  const summary = useMonthSummary();
  const problems = problemCategories(summary);
  const recent = summary.expenses.slice(0, RECENT_LIMIT);

  const payments = <UpcomingPaymentsCard />;
  const monthIn = useMonthChanged() ? 'animate-month-in' : '';

  return (
    <>
      <PageHeader title="Обзор">
        <MonthSwitcher />
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] items-start">
        <div className="min-w-0">
          <div className="mb-5"><FamilyAccountCard /></div>
          <MonthCarousel />

          {/* Month-dependent blocks fade in while the main block slides */}
          <div key={monthKey} className={`mt-5 space-y-5 ${monthIn}`}>
            {/* Phone order: summary → warnings → upcoming payments → categories → operations */}
            <div className="lg:hidden">{payments}</div>

            <Card className="p-5">
              <SectionHeader title="Расходы по категориям" />
              <SpendingStructure summary={summary} limit={3} />
            </Card>

            {summary.hasBudget && (
              <Card className="p-5">
                <SectionHeader
                  title="Категории"
                  subtitle={
                    problems.length > 0
                      ? `Требуют внимания: ${problems.length}`
                      : 'Все категории в пределах лимитов, с учётом предстоящих платежей'
                  }
                  action={
                    <Button size="sm" variant="ghost" onClick={() => setTab('analytics')} icon={<ArrowRight size={16} />} className="flex-row-reverse">
                      Аналитика
                    </Button>
                  }
                />
                <CategoryList categories={summary.categories} />
              </Card>
            )}

            <Card className="p-5">
              <SectionHeader
                title="Последние операции"
                action={
                  summary.expenses.length > RECENT_LIMIT && (
                    <Button size="sm" variant="ghost" onClick={() => setTab('analytics')} icon={<ArrowRight size={16} />} className="flex-row-reverse">
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
                  icon={<Receipt size={22} />}
                  title="Расходов пока нет"
                  description={`Добавьте первую покупку за ${formatMonthLower(monthKey)} — она сразу уменьшит свободную сумму`}
                  action={
                    <Button variant="secondary" onClick={() => openModal({ type: 'expenseForm' })}>
                      Записать покупку
                    </Button>
                  }
                />
              )}
            </Card>
          </div>
        </div>

        <aside className="space-y-5 min-w-0">
          <div key={monthKey} className={`hidden lg:block ${monthIn}`}>{payments}</div>
          <GoalsCard />
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
          <Button size="sm" variant="ghost" onClick={() => setTab('analytics')} icon={<ArrowRight size={16} />} className="flex-row-reverse">
            Все
          </Button>
        }
      />
      {upcoming.length > 0 ? (
        <PaymentList payments={upcoming} />
      ) : (
        <EmptyState
          compact
          icon={<Calendar size={22} />}
          title="Предстоящих платежей нет"
          description="Добавьте аренду, коммунальные услуги или кружки — они появятся в запланированных платежах"
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
            {m.id === currentUserId && <span className="text-sm text-ink-3">Это вы</span>}
            {m.isOwner && <span className="text-sm text-ink-3">Владелец</span>}
          </li>
        ))}
      </ul>
      {alone && (
        <div className="mt-4 p-4 rounded-xl bg-accent-soft">
          <p className="text-[15px] text-ink">Пока вы ведёте бюджет один. Пригласите партнёра, чтобы планировать вместе.</p>
          <Button className="mt-3" size="sm" icon={<PersonAdd size={16} />} onClick={() => openModal({ type: 'invite' })}>
            Пригласить
          </Button>
        </div>
      )}
    </Card>
  );
}
