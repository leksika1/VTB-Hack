import { FamilyAccountCard, FamilyContributionsCard } from '../components/account/FamilyAccountCard';
import { ArrowRight, Calendar, Receipt, PersonAdd, Refresh } from '../components/ui/icons';
import { useMonthSummary } from '../hooks/useMonthSummary';
import { useMonthChanged } from '../hooks/useMonthChanged';
import { useAnalytics } from '../hooks/useServerData';
import { useUIStore } from '../store/uiStore';
import { useFamilyStore } from '../store/familyStore';
import { formatMonthLower } from '../utils/date';
import { formatCurrency } from '../utils/currency';
import { CATEGORIES } from '../utils/categories';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { Avatar, MonthSwitcher } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Feedback';
import { ExpenseList } from '../components/expenses/ExpenseList';
import { PaymentList } from '../components/payments/PaymentList';

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
          <div className="mb-5"><FamilyContributionsCard month={monthKey} /></div>

          {/* Month-dependent blocks fade in while the main block slides */}
          <div key={monthKey} className={`space-y-5 ${monthIn}`}>
            {/* Phone order: account → contributions → upcoming payments → categories → operations */}
            <div className="lg:hidden">{payments}</div>

            <TopCategoriesCard />

            <Card className="p-5">
              <SectionHeader
                title="Последние операции"
                action={
                  summary.expenses.length > RECENT_LIMIT && (
                    <Button size="sm" variant="ghost" onClick={() => setTab('records')} icon={<ArrowRight size={16} />} className="flex-row-reverse">
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
          <FamilyStatusCard />
        </aside>
      </div>
    </>
  );
}

function TopCategoriesCard() {
  const monthKey = useUIStore((s) => s.monthKey);
  const analytics = useAnalytics(monthKey);
  const categories = analytics.data?.topCategories.slice(0, 3) ?? [];

  return (
    <Card className="p-5">
      <SectionHeader title="Расходы по категориям" />
      {analytics.loading && !analytics.data && (
        <div className="space-y-2" aria-label="Загрузка категорий">
          <div className="h-8 animate-pulse rounded-control bg-surface-muted" />
          <div className="h-8 animate-pulse rounded-control bg-surface-muted" />
          <div className="h-8 animate-pulse rounded-control bg-surface-muted" />
        </div>
      )}
      {analytics.error && !analytics.data && (
        <div role="alert" className="py-2 text-sm">
          <p className="text-danger">{analytics.error}</p>
          <Button className="mt-2" variant="secondary" size="sm" icon={<Refresh size={15} />}
            loading={analytics.loading} onClick={analytics.refetch}>Повторить</Button>
        </div>
      )}
      {analytics.data && categories.length === 0 && (
        <p className="py-2 text-ink-2">В этом месяце расходов пока нет.</p>
      )}
      {categories.length > 0 && (
        <ul>
          {categories.map((item) => (
            <li key={item.category} className="flex items-center gap-2.5 py-1.5 text-[15px]">
              <span className="size-3 shrink-0 rounded-sm" style={{ background: CATEGORIES[item.category].color }} aria-hidden />
              <span className="flex-1 text-ink-2">{CATEGORIES[item.category].label}</span>
              <span className="tabular text-ink">{formatCurrency(item.amount)}</span>
              <span className="w-11 text-right tabular text-ink-3">{formatPercent(item.percent)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const percentFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const formatPercent = (value: number) => `${percentFormatter.format(value)}%`;

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
