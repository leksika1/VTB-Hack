import { T } from '@admiral-ds/react-ui';
import { Calendar, Clipboard, AddTemplate, Edit, Plus } from '../components/ui/icons';
import { copyPaymentsFromPreviousMonth } from '../api/client';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useMonthSummary } from '../hooks/useMonthSummary';
import { useMonthChanged } from '../hooks/useMonthChanged';
import { useUIStore } from '../store/uiStore';
import { formatCurrency, formatBalance } from '../utils/currency';
import { formatMonthLower, plural, shiftMonth } from '../utils/date';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { AmountRow, MonthSwitcher } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Feedback';
import { CategoryList } from '../components/budget/CategoryList';
import { AccountHistory } from '../components/account/AccountHistory';
import { FamilyAccountBreakdown } from '../components/account/FamilyAccountCard';
import { OperationsHistory } from '../components/expenses/OperationsHistory';
import { useIsParent } from '../store/familyStore';
import { PaymentList } from '../components/payments/PaymentList';
import { GoalsCard } from '../components/goals/GoalsCard';

export function AnalyticsPage() {
  const monthKey = useUIStore((s) => s.monthKey);
  const openModal = useUIStore((s) => s.openModal);
  const summary = useMonthSummary();
  const monthIn = useMonthChanged() ? 'animate-month-in' : '';

  const isParent = useIsParent();

  return (
    <>
      <PageHeader title="Аналитика">
        <MonthSwitcher />
      </PageHeader>

      {isParent && <div key={monthKey} className={`grid grid-cols-1 items-start gap-5 min-[54rem]:grid-cols-2 ${monthIn}`}>
        <div className="min-w-0">
          <Card className="p-5">
            {summary.hasBudget ? (
              <>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <T as="h2" font="Header/H5" className="min-w-0 text-ink max-sm:!text-base">
                    <span className="max-[359px]:text-sm sm:hidden min-[54rem]:max-[60rem]:inline">Бюджет на месяц</span>
                    <span className="hidden sm:inline min-[54rem]:max-[60rem]:hidden">Бюджет на {formatMonthLower(monthKey)}</span>
                  </T>
                  <Button size="sm" variant="secondary" className="shrink-0 max-sm:!px-2" icon={<Edit size={15} />}
                    onClick={() => openModal({ type: 'budgetForm' })}>Изменить</Button>
                </div>
                <div className="plan-balance brand-surface">
                  <p className="text-sm text-ink-2">Общий план</p>
                  <p className="balance-number">{formatCurrency(summary.plan)}</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <AmountRow label="Потрачено" value={formatCurrency(summary.spent)} />
                    <AmountRow label="Запланировано" value={formatCurrency(summary.reserved)} />
                    <AmountRow label="Свободно" value={formatBalance(summary.freeByPlan)}
                      tone={summary.freeByPlan < 0 ? 'danger' : undefined} />
                  </div>
                  {summary.unallocated > 0 && (
                    <AmountRow label="Не распределено по категориям" value={formatCurrency(summary.unallocated)} tone="muted" />
                  )}
                </div>
                <h3 className="font-semibold text-ink mb-1">Лимиты категорий</h3>
                <CategoryList categories={summary.categories} />
              </>
            ) : (
              <EmptyState
                icon={<Clipboard size={22} />}
                title="Бюджет на месяц не задан"
                description="Укажите общую сумму на месяц или лимиты только для важных категорий. Можно взять за основу прошлый месяц."
                action={<Button onClick={() => openModal({ type: 'budgetForm' })}>Задать бюджет</Button>}
              />
            )}
          </Card>
        </div>

        <div className="space-y-5 min-w-0">
          <PaymentsCard />
          <GoalsCard />
        </div>
      </div>}
      <div className={isParent ? 'mt-5 space-y-5' : undefined}>
        {isParent && <AccountHistory month={monthKey} />}
        {isParent && <FamilyAccountBreakdown month={monthKey} />}
        <OperationsHistory key={monthKey} />
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
  const copyLabel = `Перенести платежи из прошлого месяца (${prevCount})`;

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
    <Card className="p-5 pb-2">
      <SectionHeader
        title="Обязательные платежи"
        subtitle={
          summary.upcomingPayments.length > 0
            ? `Запланировано ${formatCurrency(summary.reserved)}`
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
          icon={<Calendar size={22} />}
          title="Платежей на этот месяц нет"
          description="Аренда, коммуналка, сад, страховка — всё, что нужно оплатить обязательно. Их сумма вычитается из свободной."
          action={
            prevCount > 0 ? (
              <Button size="sm" variant="secondary" className="!px-2.5" icon={<AddTemplate size={16} />}
                aria-label={copyLabel} loading={copy.pending} onClick={onCopy}>
                Из прошлого месяца ({prevCount})
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
        <Button size="sm" variant="ghost" className="mt-3 !px-2.5" icon={<AddTemplate size={15} />}
          aria-label={copyLabel} loading={copy.pending} onClick={onCopy}>
          Из прошлого месяца ({prevCount})
        </Button>
      )}
    </Card>
  );
}
