import { CalendarClock, ClipboardList, CopyPlus, Pencil, Plus } from 'lucide-react';
import { copyPaymentsFromPreviousMonth } from '../api/client';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useMonthSummary } from '../hooks/useMonthSummary';
import { useMonthChanged } from '../hooks/useMonthChanged';
import { useUIStore } from '../store/uiStore';
import { formatCurrency, formatBalance } from '../utils/currency';
import { formatMonthIn, formatMonthLower, plural, shiftMonth } from '../utils/date';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { AmountRow, MonthSwitcher } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Feedback';
import { CategoryList } from '../components/budget/CategoryList';
import { SpendingStructure } from '../components/budget/SpendingStructure';
import { PaymentList } from '../components/payments/PaymentList';
import { GoalsCard } from '../components/goals/GoalsCard';

export function PlanPage() {
  const monthKey = useUIStore((s) => s.monthKey);
  const openModal = useUIStore((s) => s.openModal);
  const summary = useMonthSummary();
  const monthIn = useMonthChanged() ? 'animate-month-in' : '';

  return (
    <>
      <PageHeader title="План">
        <MonthSwitcher />
      </PageHeader>

      <div key={monthKey} className={`grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start ${monthIn}`}>
        <div className="space-y-5 min-w-0">
          <Card className="p-5">
            {summary.hasBudget ? (
              <>
                <SectionHeader
                  title={`Бюджет на ${formatMonthLower(monthKey)}`}
                  action={
                    <Button size="sm" variant="secondary" icon={<Pencil size={15} />} onClick={() => openModal({ type: 'budgetForm' })}>
                      Изменить
                    </Button>
                  }
                />
                <div className="rounded-xl brand-surface px-4 py-3 mb-4 text-[15px]">
                  <AmountRow label="Общий план" value={formatCurrency(summary.plan)} strong />
                  <AmountRow label="Потрачено" value={formatCurrency(summary.spent)} />
                  <AmountRow label="Зарезервировано на платежи" value={formatCurrency(summary.reserved)} />
                  <AmountRow
                    label="Свободно по плану"
                    value={formatBalance(summary.freeByPlan)}
                    strong
                    tone={summary.freeByPlan < 0 ? 'danger' : undefined}
                  />
                  {summary.unallocated > 0 && (
                    <AmountRow label="Не распределено по категориям" value={formatCurrency(summary.unallocated)} tone="muted" />
                  )}
                </div>
                <h3 className="font-semibold text-ink mb-1">Лимиты категорий</h3>
                <CategoryList categories={summary.categories} />
              </>
            ) : (
              <EmptyState
                icon={<ClipboardList size={22} />}
                title={`Бюджет на ${formatMonthLower(monthKey)} не задан`}
                description="Укажите общую сумму на месяц или лимиты только для важных категорий. Можно взять за основу прошлый месяц."
                action={<Button onClick={() => openModal({ type: 'budgetForm' })}>Задать бюджет</Button>}
              />
            )}
          </Card>

          <GoalsCard />
        </div>

        <div className="space-y-5 min-w-0">
          <PaymentsCard />

          <Card className="p-5">
            <SectionHeader title="Структура расходов" subtitle={`Куда ушли деньги ${formatMonthIn(monthKey)}`} />
            <SpendingStructure summary={summary} />
          </Card>
        </div>
      </div>
    </>
  );
}

function PaymentsCard() {
  const monthKey = useUIStore((s) => s.monthKey);
  const openModal = useUIStore((s) => s.openModal);
  const addToast = useUIStore((s) => s.addToast);
  const summary = useMonthSummary();
  const previous = useMonthSummary(shiftMonth(monthKey, -1));
  const copy = useAsyncAction(copyPaymentsFromPreviousMonth);
  const hasAny = summary.upcomingPayments.length + summary.paidPayments.length > 0;
  // Mirrors the server: series payments appear by themselves, and a title already in this month is not copied again
  const titles = new Set([...summary.upcomingPayments, ...summary.paidPayments].map((p) => p.title));
  const prevCount = new Set(
    [...previous.upcomingPayments, ...previous.paidPayments].filter((p) => !p.seriesId && !titles.has(p.title)).map((p) => p.title)
  ).size;

  const onCopy = async () => {
    const res = await copy.run(monthKey);
    if (res.ok) {
      addToast(
        res.value > 0
          ? `Перенесено ${res.value} ${plural(res.value, 'платёж', 'платежа', 'платежей')} — проверьте даты и суммы`
          : 'Все платежи прошлого месяца уже есть в этом',
        res.value > 0 ? 'success' : 'info'
      );
    }
  };

  return (
    <Card className="p-5">
      <SectionHeader
        title="Обязательные платежи"
        subtitle={
          summary.upcomingPayments.length > 0
            ? `Предстоит ${formatCurrency(summary.reserved)} — эта сумма зарезервирована`
            : undefined
        }
        action={
          <Button size="sm" variant="secondary" icon={<Plus size={16} />} onClick={() => openModal({ type: 'paymentForm' })}>
            Добавить
          </Button>
        }
      />

      {!hasAny && (
        <EmptyState
          compact
          icon={<CalendarClock size={22} />}
          title="Платежей на этот месяц нет"
          description="Аренда, коммуналка, сад, страховка — всё, что нужно оплатить обязательно. Их сумма вычитается из свободной."
          action={
            prevCount > 0 ? (
              <Button variant="secondary" icon={<CopyPlus size={16} />} loading={copy.pending} onClick={onCopy}>
                Перенести платежи из прошлого месяца ({prevCount})
              </Button>
            ) : undefined
          }
        />
      )}
      {copy.error && <p role="alert" className="text-sm text-danger text-center">{copy.error}</p>}

      {summary.upcomingPayments.length > 0 && (
        <PaymentList payments={summary.upcomingPayments} editable />
      )}
      {summary.paidPayments.length > 0 && (
        <div className={summary.upcomingPayments.length > 0 ? 'mt-5 pt-4 border-t border-line' : ''}>
          <h3 className="text-sm font-semibold text-ink-2 mb-1">Оплачены — уже в расходах</h3>
          <PaymentList payments={summary.paidPayments} />
        </div>
      )}
      {/* Copying payments is separate from copying the budget limits («Заполнить как …» in the budget form) */}
      {hasAny && prevCount > 0 && (
        <Button size="sm" variant="ghost" className="mt-3" icon={<CopyPlus size={15} />} loading={copy.pending} onClick={onCopy}>
          Перенести платежи из прошлого месяца ({prevCount})
        </Button>
      )}
    </Card>
  );
}
