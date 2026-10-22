import { useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, CopyPlus } from 'lucide-react';
import type { ExpenseCategory } from '../../types';
import { saveBudget } from '../../api/client';
import { useAsyncAction, useRequestId } from '../../hooks/useAsyncAction';
import { useMonthSummary } from '../../hooks/useMonthSummary';
import { budgetKey, useDataStore } from '../../store/dataStore';
import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { ALL_CATEGORIES, CATEGORIES, emptyCategoryRecord } from '../../utils/categories';
import { amountToInput, formatCurrency, parseAmount, validateAmount } from '../../utils/currency';
import { formatMonthIn, formatMonthKey, formatMonthLower, shiftMonth } from '../../utils/date';
import { Modal } from '../ui/Modal';
import { AmountField, FormError } from '../ui/Field';
import { Button, IconButton } from '../ui/Button';
import { CategoryIcon } from '../ui/Misc';

type PlanInputs = Record<ExpenseCategory, string>;

function toInputs(plans: Record<ExpenseCategory, number> | undefined): PlanInputs {
  const src = plans ?? emptyCategoryRecord();
  return Object.fromEntries(ALL_CATEGORIES.map((k) => [k, amountToInput(src[k])])) as PlanInputs;
}

export function BudgetFormModal() {
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);
  const viewedMonth = useUIStore((s) => s.monthKey);
  const setMonthKey = useUIStore((s) => s.setMonthKey);
  const familyId = useFamilyStore((s) => s.family?.id ?? '');
  const budgets = useDataStore((s) => s.budgets);
  const requestId = useRequestId();
  const save = useAsyncAction(saveBudget);

  // The edited period is explicit and may differ from the viewed one
  const [month, setMonth] = useState(viewedMonth);
  const existing = budgets[budgetKey(familyId, month)];
  const prevMonth = shiftMonth(month, -1);
  const previous = budgets[budgetKey(familyId, prevMonth)];
  const current = useMonthSummary(month);
  const prevSummary = useMonthSummary(prevMonth);

  const [total, setTotal] = useState(amountToInput(existing?.totalAmount));
  const [plans, setPlans] = useState<PlanInputs>(toInputs(existing?.categoryPlans));
  const [submitted, setSubmitted] = useState(false);

  const changeMonth = (delta: number) => {
    const next = shiftMonth(month, delta);
    const b = budgets[budgetKey(familyId, next)];
    setMonth(next);
    setTotal(amountToInput(b?.totalAmount));
    setPlans(toInputs(b?.categoryPlans));
    setSubmitted(false);
    save.reset();
  };

  const copyPrevious = () => {
    if (!previous) return;
    setTotal(amountToInput(previous.totalAmount));
    setPlans(toInputs(previous.categoryPlans));
  };

  const totalNum = parseAmount(total) ?? 0;
  const planErrors = Object.fromEntries(
    ALL_CATEGORIES.map((k) => [k, plans[k].trim() ? validateAmount(plans[k], { allowZero: true }) : null])
  ) as Record<ExpenseCategory, string | null>;
  const allocated = ALL_CATEGORIES.reduce((s, k) => s + (parseAmount(plans[k]) ?? 0), 0);
  const unallocated = Math.round((totalNum - allocated) * 100) / 100;
  const overAllocated = unallocated < 0;
  const totalError = submitted ? validateAmount(total) : null;
  const committed = current.spent + current.reserved;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (validateAmount(total) || overAllocated || ALL_CATEGORIES.some((k) => planErrors[k])) return;
    const categoryPlans = emptyCategoryRecord();
    for (const k of ALL_CATEGORIES) categoryPlans[k] = parseAmount(plans[k]) ?? 0;

    const res = await save.run({ monthKey: month, totalAmount: totalNum, categoryPlans }, `${requestId}:${month}`);
    if (!res.ok) return;
    closeModal();
    if (month !== viewedMonth) {
      addToast(`Бюджет на ${formatMonthLower(month)} сохранён`, 'success', { label: 'Показать', onClick: () => setMonthKey(month) });
    } else {
      addToast('Бюджет сохранён');
    }
  };

  return (
    <Modal
      size="lg"
      title={`Бюджет на ${formatMonthLower(month)}`}
      description="План — это договорённость семьи о лимитах. Категории помогают не выйти за общий бюджет."
      onClose={closeModal}
      footer={
        <div className="space-y-3">
          <div
            className={`flex items-center justify-between gap-3 text-[15px] ${overAllocated ? 'text-danger font-medium' : 'text-ink-2'}`}
            role="status"
          >
            <span>{overAllocated ? 'Лимиты больше бюджета на' : 'Не распределено по категориям'}</span>
            <span className="tabular font-semibold">{formatCurrency(Math.abs(unallocated))}</span>
          </div>
          <Button type="submit" form="budget-form" fullWidth size="lg" loading={save.pending} disabled={overAllocated}>
            Сохранить бюджет
          </Button>
        </div>
      }
    >
      <form id="budget-form" onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted px-2 py-1.5">
          <IconButton label="Предыдущий месяц" onClick={() => changeMonth(-1)}>
            <ChevronLeft size={20} />
          </IconButton>
          <div className="text-center">
            <div className="text-xs text-ink-3">Период</div>
            <div className="font-semibold text-ink">{formatMonthKey(month)}</div>
            <div className="text-xs text-ink-3">{existing ? 'план уже задан — редактирование' : 'новый план'}</div>
          </div>
          <IconButton label="Следующий месяц" onClick={() => changeMonth(1)}>
            <ChevronRight size={20} />
          </IconButton>
        </div>

        {previous && (
          <Button variant="secondary" size="sm" icon={<CopyPlus size={16} />} onClick={copyPrevious}>
            Заполнить как {formatMonthIn(prevMonth)}
          </Button>
        )}

        <AmountField
          label="Общий бюджет на месяц"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          placeholder="0"
          emphasis
          error={totalError ?? (save.errorField === 'total' ? save.error : null)}
          hint={
            [
              committed > 0 ? `Уже потрачено и зарезервировано: ${formatCurrency(committed)}` : null,
              previous ? `План ${formatMonthIn(prevMonth)}: ${formatCurrency(previous.totalAmount)}` : null,
            ]
              .filter(Boolean)
              .join('. ') || undefined
          }
        />

        <fieldset>
          <legend className="text-sm font-medium text-ink-2 mb-2">Лимиты по категориям</legend>
          <ul className="divide-y divide-line">
            {ALL_CATEGORIES.map((k) => {
              const cat = current.categories.find((c) => c.key === k)!;
              const prevCat = prevSummary.categories.find((c) => c.key === k)!;
              const context = [
                cat.spent > 0 ? `Потрачено ${formatCurrency(cat.spent)}` : null,
                cat.reserved > 0 ? `платежи ${formatCurrency(cat.reserved)}` : null,
                previous ? `${formatMonthIn(prevMonth)}: план ${formatCurrency(prevCat.plan)}, факт ${formatCurrency(prevCat.spent)}` : null,
              ]
                .filter(Boolean)
                .join('; ');
              return (
                <li key={k} className="py-3 flex items-start gap-3">
                  <span className="pt-6"><CategoryIcon category={k} size="sm" /></span>
                  <div className="flex-1 min-w-0">
                    <AmountField
                      label={CATEGORIES[k].label}
                      value={plans[k]}
                      onChange={(e) => setPlans((p) => ({ ...p, [k]: e.target.value }))}
                      placeholder="Не задан"
                      error={planErrors[k]}
                      hint={context || undefined}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>

        {save.error && !save.errorField && <FormError>{save.error}</FormError>}
      </form>
    </Modal>
  );
}
