import { useState } from 'react';
import { Calculator, ChevronDown, Plus, TriangleAlert } from 'lucide-react';
import type { MonthSummary } from '../../domain/budget';
import { formatBalance, formatCurrency } from '../../utils/currency';
import { formatMonthLower, plural } from '../../utils/date';
import { useUIStore } from '../../store/uiStore';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';

/** The one primary financial block: what is free to spend after expenses and upcoming mandatory payments */
export function FreeAmountCard({ summary, monthKey }: { summary: MonthSummary; monthKey: string }) {
  const openModal = useUIStore((s) => s.openModal);
  const [explained, setExplained] = useState(false);
  const short = summary.freeByPlan < 0;
  const overspent = summary.leftByPlan < 0;
  const paymentsCount = summary.upcomingPayments.length;

  return (
    <section
      aria-labelledby="free-amount-title"
      className="rounded-[var(--radius-card)] brand-surface p-5 sm:p-6
        shadow-[var(--shadow-card)]"
    >
      <h2 id="free-amount-title" className="text-[15px] text-brand-ink-2">
        {short ? 'Не хватает по плану' : 'Свободно по плану'} на {formatMonthLower(monthKey)}
      </h2>
      <p className="text-[40px] sm:text-[44px] leading-tight font-bold tracking-tight tabular mt-1">
        {formatCurrency(Math.abs(summary.freeByPlan))}
      </p>
      <p className="text-[15px] text-brand-ink-2 mt-1">
        {short
          ? 'Предстоящие платежи не помещаются в план — пересмотрите лимиты или расходы'
          : paymentsCount > 0
            ? `Уже за вычетом ${paymentsCount} ${plural(paymentsCount, 'предстоящего платежа', 'предстоящих платежей', 'предстоящих платежей')}`
            : 'Предстоящих обязательных платежей нет'}
      </p>

      <div className="mt-5">
        <ProgressBar
          tone="inverse"
          value={summary.spent}
          reserved={summary.reserved}
          max={summary.plan}
          label={`Потрачено ${formatCurrency(summary.spent)} и зарезервировано ${formatCurrency(summary.reserved)} из ${formatCurrency(summary.plan)}`}
        />
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-sm text-brand-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[3px] bg-white" aria-hidden />
            Потрачено <span className="text-white font-medium tabular">{formatCurrency(summary.spent)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[3px] bg-[repeating-linear-gradient(135deg,#fff_0_2px,transparent_2px_4px)] ring-1 ring-white/60" aria-hidden />
            Зарезервировано <span className="text-white font-medium tabular">{formatCurrency(summary.reserved)}</span>
          </span>
          <span>
            План <span className="text-white font-medium tabular">{formatCurrency(summary.plan)}</span>
          </span>
        </div>
      </div>

      {overspent && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-white/12 px-3.5 py-2.5 text-[15px]">
          <TriangleAlert size={18} className="shrink-0 mt-0.5 text-[#ffc46b]" aria-hidden />
          <span>
            Бюджет превышен: потрачено на <b className="tabular">{formatCurrency(-summary.leftByPlan)}</b> больше плана.
          </span>
        </p>
      )}

      <button
        type="button"
        onClick={() => setExplained((v) => !v)}
        aria-expanded={explained}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-white/90 hover:text-white"
      >
        Как считается
        <ChevronDown size={16} className={`transition-transform ${explained ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <div className="collapsible" data-open={explained} aria-hidden={!explained}>
        <div>
          <dl className="mt-2 rounded-xl bg-white/10 px-4 py-3 text-[15px] space-y-1.5">
            <CalcRow label="План на месяц" value={formatCurrency(summary.plan)} />
            <CalcRow label="− Уже потрачено" value={formatCurrency(summary.spent)} />
            <CalcRow label="= Осталось по плану" value={formatBalance(summary.leftByPlan)} strong />
            <CalcRow label={`− Предстоящие платежи (${paymentsCount})`} value={formatCurrency(summary.reserved)} />
            <CalcRow label={short ? '= Не хватает' : '= Свободно по плану'} value={formatBalance(summary.freeByPlan)} strong />
            <p className="text-[13px] text-brand-ink-2 pt-1.5">
              План — это договорённость семьи о лимите, а не остаток на счёте. Оплаченный платёж становится расходом и
              больше не резервируется — он учитывается один раз.
            </p>
          </dl>
        </div>
      </div>

      <div className="mt-5 flex flex-col sm:flex-row gap-2.5">
        <Button variant="inverse" size="lg" className="sm:flex-1" icon={<Calculator size={18} />} onClick={() => openModal({ type: 'purchaseCheck' })}>
          Проверить покупку
        </Button>
        <Button variant="onBrand" size="lg" className="sm:flex-1" icon={<Plus size={18} />} onClick={() => openModal({ type: 'expenseForm' })}>
          Добавить расход
        </Button>
      </div>
    </section>
  );
}

function CalcRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'font-semibold text-white' : 'text-brand-ink-2'}`}>
      <dt>{label}</dt>
      <dd className="tabular whitespace-nowrap">{value}</dd>
    </div>
  );
}
