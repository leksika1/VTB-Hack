import { useState } from 'react';
import { Calculator, ChevronDown, ChevronRight, Plus, TriangleAlert } from 'lucide-react';
import { categoryShortages, type MonthSummary } from '../../domain/budget';
import { CATEGORIES } from '../../utils/categories';
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
  const shortages = categoryShortages(summary);
  const worst = shortages[0];

  return (
    <section
      aria-labelledby="free-amount-title"
      className="rounded-[var(--radius-card)] brand-surface p-5 sm:p-6
        shadow-[var(--shadow-card)]"
    >
      <h2 id="free-amount-title" className="text-[15px] text-brand-ink-2">
        {short ? 'Не хватает по плану' : 'Свободно по плану'} на {formatMonthLower(monthKey)}
      </h2>
      <p className="text-[36px] sm:text-[44px] leading-tight font-bold tracking-tight tabular mt-1">
        {formatCurrency(Math.abs(summary.freeByPlan))}
      </p>
      {/* The free amount is not «money for any extra purchase»: everyday spending until the month end is not set aside */}
      <p className="text-sm text-brand-ink-2 mt-1">
        {short
          ? 'Предстоящие платежи не помещаются в план — пересмотрите лимиты или расходы.'
          : paymentsCount > 0
            ? 'После внесённых обязательных платежей. Будущие повседневные расходы отдельно не зарезервированы.'
            : 'Обязательных платежей не внесено. Будущие повседневные расходы отдельно не зарезервированы.'}
      </p>

      {/* How «Свободно» follows from the remainder, without opening the explanation */}
      {paymentsCount > 0 && (
        <dl className="mt-3 rounded-xl bg-white/10 px-3.5 py-2 text-sm space-y-0.5">
          <CalcRow label="До резерва платежей" value={formatBalance(summary.leftByPlan)} />
          <CalcRow
            label={`− ${paymentsCount} ${plural(paymentsCount, 'предстоящий платёж', 'предстоящих платежа', 'предстоящих платежей')}`}
            value={formatCurrency(summary.reserved)}
          />
        </dl>
      )}

      {worst && (
        <button
          type="button"
          onClick={() => openModal({ type: 'budgetForm', focus: worst.key })}
          className="mt-3 w-full flex items-start gap-2 rounded-xl bg-white/12 hover:bg-white/20 transition-colors px-3.5 py-2.5 text-left text-sm"
        >
          <TriangleAlert size={17} className="shrink-0 mt-px text-[#ffc46b]" aria-hidden />
          <span className="flex-1">
            В категории «{CATEGORIES[worst.key].label}» не хватает <b className="tabular">{formatCurrency(-worst.left)}</b> — пересмотрите
            лимит
            {shortages.length > 1 && (
              <span className="text-brand-ink-2">
                {' '}
                (и ещё в {shortages.length - 1} {plural(shortages.length - 1, 'категории', 'категориях', 'категориях')})
              </span>
            )}
          </span>
          <ChevronRight size={17} className="shrink-0 mt-px" aria-hidden />
        </button>
      )}

      {overspent && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-white/12 px-3.5 py-2.5 text-sm">
          <TriangleAlert size={17} className="shrink-0 mt-px text-[#ffc46b]" aria-hidden />
          <span>
            Бюджет превышен: потрачено на <b className="tabular">{formatCurrency(-summary.leftByPlan)}</b> больше плана.
          </span>
        </p>
      )}

      <div className="mt-4">
        <ProgressBar
          tone="inverse"
          value={summary.spent}
          reserved={summary.reserved}
          max={summary.plan}
          label={`Потрачено ${formatCurrency(summary.spent)} и зарезервировано ${formatCurrency(summary.reserved)} из ${formatCurrency(summary.plan)}`}
        />
        {/* On a phone the legend lives in «Подробнее», so the categories and payments stay closer to the top */}
        <div className="hidden sm:flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-sm text-brand-ink-2">
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

      <button
        type="button"
        onClick={() => setExplained((v) => !v)}
        aria-expanded={explained}
        className="mt-3 inline-flex items-center gap-1.5 min-h-8 text-sm font-medium text-white/90 hover:text-white"
      >
        Как считается
        <ChevronDown size={16} className={`transition-transform ${explained ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <div className="collapsible" data-open={explained} aria-hidden={!explained}>
        <div>
          <dl className="mt-2 rounded-xl bg-white/10 px-4 py-3 text-sm space-y-1.5">
            <CalcRow label="План на месяц" value={formatCurrency(summary.plan)} />
            <CalcRow label="− Уже потрачено" value={formatCurrency(summary.spent)} />
            <CalcRow label="= Остаток без учёта будущих платежей" value={formatBalance(summary.leftByPlan)} strong />
            <CalcRow label={`− Предстоящие платежи (${paymentsCount})`} value={formatCurrency(summary.reserved)} />
            <CalcRow label={short ? '= Не хватает' : '= Свободно по плану'} value={formatBalance(summary.freeByPlan)} strong />
            <p className="text-[13px] text-brand-ink-2 pt-1.5">
              План — это договорённость семьи о лимите, а не остаток на счёте. Оплаченный платёж становится расходом и
              больше не резервируется — он учитывается один раз. Повседневные траты до конца месяца (продукты, проезд)
              заранее не вычитаются: они уменьшат свободную сумму, когда будут записаны.
            </p>
          </dl>
        </div>
      </div>

      {/* One main action and one secondary; the budget itself is edited on the «План» tab */}
      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <Button variant="inverse" className="sm:flex-1" icon={<Calculator size={18} />} onClick={() => openModal({ type: 'purchaseCheck' })}>
          Проверить покупку
        </Button>
        <Button variant="onBrand" className="sm:flex-1" icon={<Plus size={18} />} onClick={() => openModal({ type: 'expenseForm' })}>
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
