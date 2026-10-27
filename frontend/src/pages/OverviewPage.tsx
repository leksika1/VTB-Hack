import { ArrowRight, CalendarClock, HandCoins, PiggyBank, Plus, ReceiptText, UserPlus } from 'lucide-react';
import { problemCategories } from '../domain/budget';
import { useMonthSummary } from '../hooks/useMonthSummary';
import { useMonthChanged } from '../hooks/useMonthChanged';
import { useUIStore } from '../store/uiStore';
import { useFamilyStore, useIsParent } from '../store/familyStore';
import { useDataStore } from '../store/dataStore';
import { formatCurrency } from '../utils/currency';
import { formatDateShort } from '../utils/date';
import { ProgressBar } from '../components/ui/ProgressBar';
import { formatMonthLower } from '../utils/date';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { Avatar, MonthSwitcher } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Feedback';
import { MonthCarousel } from '../components/budget/MonthCarousel';
import { CategoryList } from '../components/budget/CategoryList';
import { ExpenseList } from '../components/expenses/ExpenseList';
import { PaymentList } from '../components/payments/PaymentList';
import { MyRequestsCard, PendingRequestsCard } from '../components/purchase/RequestCards';
import { GoalsCard } from '../components/goals/GoalsCard';

const RECENT_LIMIT = 5;
const PAYMENTS_LIMIT = 3;

export function OverviewPage() {
  return useIsParent() ? <FamilyOverview /> : <ChildOverview />;
}

/** Main screen of an adult: the family budget of the month */
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
        <div className="space-y-5 min-w-0">
          <MonthCarousel />

          <PendingRequestsCard />

          {/* Month-dependent blocks fade in while the main block slides */}
          <div key={monthKey} className={`space-y-5 ${monthIn}`}>
            {/* Phone order: summary → warnings → upcoming payments → categories → operations */}
            <div className="lg:hidden">{payments}</div>

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
                    <Button size="sm" variant="ghost" onClick={() => setTab('plan')} icon={<ArrowRight size={16} />} className="flex-row-reverse">
                      План
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
          <div key={monthKey} className={`hidden lg:block ${monthIn}`}>{payments}</div>
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
  const isParent = useIsParent();
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
            {m.role === 'child' && <span className="text-sm text-ink-3">Ребёнок</span>}
          </li>
        ))}
      </ul>
      {alone && isParent && (
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

/**
 * Main screen of a child: own pocket money and own expenses. The family budget, payments and other
 * members' expenses are not available to a child (the server does not send them).
 */
function ChildOverview() {
  const monthKey = useUIStore((s) => s.monthKey);
  const openModal = useUIStore((s) => s.openModal);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const allowance = useDataStore((s) => s.allowances.find((a) => a.memberId === currentUserId) ?? null);
  const summary = useMonthSummary();
  const monthIn = useMonthChanged() ? 'animate-month-in' : '';

  return (
    <>
      <PageHeader title="Мои траты">
        <MonthSwitcher />
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] items-start">
        <div className="space-y-5 min-w-0">
          <section className="rounded-[var(--radius-card)] brand-surface p-5 sm:p-6 shadow-[var(--shadow-card)]">
            {allowance ? (
              <>
                <h2 className="text-[15px] text-brand-ink-2">
                  Карманные деньги на {allowance.period === 'week' ? 'неделю' : 'месяц'}: осталось
                </h2>
                <p className={`text-[40px] leading-tight font-bold tracking-tight tabular mt-1 ${allowance.left < 0 ? 'text-[#ffc46b]' : ''}`}>
                  {formatCurrency(allowance.left)}
                </p>
                <p className="text-[15px] text-brand-ink-2 mt-1">
                  из {formatCurrency(allowance.amount)} · {formatDateShort(allowance.periodStart)} — {formatDateShort(allowance.periodEnd)}
                </p>
                <div className="mt-5">
                  <ProgressBar
                    tone="inverse"
                    value={allowance.spent}
                    max={allowance.amount}
                    label={`Потрачено ${formatCurrency(allowance.spent)} из ${formatCurrency(allowance.amount)}`}
                  />
                  <p className="text-sm text-brand-ink-2 mt-2">
                    Потрачено <span className="text-white font-medium tabular">{formatCurrency(allowance.spent)}</span>
                  </p>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[15px] text-brand-ink-2 flex items-center gap-2">
                  <PiggyBank size={18} aria-hidden /> Карманные деньги
                </h2>
                <p className="text-xl font-semibold mt-2">Пока не назначены</p>
                <p className="text-[15px] text-brand-ink-2 mt-1">
                  Когда взрослые назначат карманные деньги, вы сможете сами записывать траты. А купить что-то можно попросить уже сейчас.
                </p>
              </>
            )}
            {/* Without pocket money the server does not accept own expenses — only a request */}
            <div className="mt-5 flex flex-col sm:flex-row gap-2.5">
              {allowance && (
                <Button variant="inverse" size="lg" className="sm:flex-1" icon={<Plus size={18} />} onClick={() => openModal({ type: 'expenseForm' })}>
                  Добавить расход
                </Button>
              )}
              <Button
                variant={allowance ? 'onBrand' : 'inverse'}
                size="lg"
                className="sm:flex-1"
                icon={<HandCoins size={18} />}
                onClick={() => openModal({ type: 'purchaseRequestForm' })}
              >
                Попросить покупку
              </Button>
            </div>
          </section>

          <Card key={monthKey} className={`p-5 ${monthIn}`}>
            <SectionHeader title={`Мои расходы за ${formatMonthLower(monthKey)}`} />
            {summary.expenses.length > 0 ? (
              <ExpenseList expenses={summary.expenses} showDate />
            ) : (
              <EmptyState compact icon={<ReceiptText size={22} />} title="Расходов пока нет" description="Здесь появятся ваши покупки" />
            )}
          </Card>
        </div>

        <aside className="space-y-5 min-w-0">
          <MyRequestsCard />
          <GoalsCard />
          <FamilyStatusCard />
        </aside>
      </div>
    </>
  );
}
