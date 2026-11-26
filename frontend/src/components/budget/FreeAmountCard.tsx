import { NotificationItem, NotificationItemButtonPanel, NotificationItemContent, T, TextButton } from '@admiral-ds/react-ui';
import { useId, useState } from 'react';
import { ChevronDown } from '../ui/icons';
import { categoryShortages, type MonthSummary } from '../../domain/budget';
import { CATEGORIES } from '../../utils/categories';
import { formatBalance, formatCurrency } from '../../utils/currency';
import { formatMonthLower, plural } from '../../utils/date';
import { useUIStore } from '../../store/uiStore';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';

/** Monthly budget allowance and category limits. */
export function FreeAmountCard({ summary, monthKey }: { summary: MonthSummary; monthKey: string }) {
  const openModal = useUIStore((s) => s.openModal);
  const [explained, setExplained] = useState(false);
  const explanationId = useId();
  const short = summary.freeByPlan < 0;
  const overspent = summary.leftByPlan < 0;
  const paymentsCount = summary.upcomingPayments.length;
  const shortages = categoryShortages(summary);
  const worst = shortages[0];

  return (
    <section
      aria-labelledby="free-amount-title"
      className="rounded-card bg-surface p-5 sm:p-6"
    >
      <T as="h2" id="free-amount-title" font="Body/Body 1 Short">
        {short ? 'Не хватает по плану' : 'Свободно по плану'} на {formatMonthLower(monthKey)}
      </T>
      <T as="p" font="Header/H3" className="mt-1 tabular">
        {formatCurrency(Math.abs(summary.freeByPlan))}
      </T>
      <p className="mt-2 text-sm text-ink-2">
        {short ? 'Расходы и предстоящие платежи превышают бюджет.' : 'После расходов и запланированных платежей.'}
      </p>
      <dl className="budget-metrics mt-5">
        <CalcRow label="План месяца" value={formatCurrency(summary.plan)} />
        <CalcRow label="Потрачено" value={formatCurrency(summary.spent)} />
        <CalcRow label="Запланировано" value={formatCurrency(summary.reserved)} />
      </dl>

      {worst && (
        <NotificationItem className="mt-3" status="warning" displayStatusIcon isBorderHidden>
          <NotificationItemContent>
            В категории «{CATEGORIES[worst.key].label}» не хватает <b>{formatCurrency(-worst.left)}</b>.
            {shortages.length > 1 && ` Ещё в ${shortages.length - 1} ${plural(shortages.length - 1, 'категории', 'категориях', 'категориях')} превышен лимит.`}
          </NotificationItemContent>
          <NotificationItemButtonPanel>
            <TextButton text="Пересмотреть лимит" dimension="s" onClick={() => openModal({ type: 'budgetForm', focus: worst.key })} />
          </NotificationItemButtonPanel>
        </NotificationItem>
      )}

      {overspent && (
        <NotificationItem className="mt-3" status="warning" displayStatusIcon isBorderHidden>
          <NotificationItemContent>
            Потрачено на <b>{formatCurrency(-summary.leftByPlan)}</b> больше плана.
          </NotificationItemContent>
        </NotificationItem>
      )}

      <div className="mt-4">
        <ProgressBar
          value={summary.spent}
          reserved={summary.reserved}
          max={summary.plan}
          label={`Потрачено ${formatCurrency(summary.spent)} и запланировано ${formatCurrency(summary.reserved)} из ${formatCurrency(summary.plan)}`}
        />
      </div>

      <Button
        size="sm" variant="secondary" className="mt-3"
        onClick={() => setExplained((v) => !v)} aria-expanded={explained} aria-controls={explanationId}
        icon={<ChevronDown size={16} className={`transition-transform ${explained ? 'rotate-180' : ''}`} />}
      >
        Как считается
      </Button>
      <div id={explanationId} className="collapsible" data-open={explained} inert={!explained}>
        <div>
          <dl className="mt-2 rounded-xl bg-surface-muted px-4 py-3 text-sm space-y-1.5">
            <CalcRow label="План на месяц" value={formatCurrency(summary.plan)} />
            <CalcRow label="− Уже потрачено" value={formatCurrency(summary.spent)} />
            <CalcRow label="= Остаток без учёта будущих платежей" value={formatBalance(summary.leftByPlan)} strong />
            <CalcRow label={`− Предстоящие платежи (${paymentsCount})`} value={formatCurrency(summary.reserved)} />
            <CalcRow label={short ? '= Не хватает' : '= Свободно по плану'} value={formatBalance(summary.freeByPlan)} strong />
            <p className="text-[13px] text-ink-2 pt-1.5">
              План — это договорённость семьи о лимите, а не остаток на счёте. Оплаченный платёж становится расходом и
              больше не резервируется — он учитывается один раз. Повседневные траты до конца месяца (продукты, проезд)
              заранее не вычитаются: они уменьшат свободную сумму, когда будут записаны.
            </p>
          </dl>
        </div>
      </div>

    </section>
  );
}

function CalcRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'font-semibold text-ink' : 'text-ink-2'}`}>
      <dt>{label}</dt>
      <dd className="tabular whitespace-nowrap">{value}</dd>
    </div>
  );
}
