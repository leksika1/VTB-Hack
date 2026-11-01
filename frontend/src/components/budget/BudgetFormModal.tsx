import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRightLeft, Check, ChevronLeft, ChevronRight, CopyPlus } from 'lucide-react';
import type { ExpenseCategory } from '../../types';
import { saveBudget } from '../../api/client';
import { useAsyncAction, useRequestId } from '../../hooks/useAsyncAction';
import { useMonthSummary } from '../../hooks/useMonthSummary';
import { budgetKey, useDataStore } from '../../store/dataStore';
import { useFamilyStore } from '../../store/familyStore';
import { useUIStore, type PurchaseDraft } from '../../store/uiStore';
import { ALL_CATEGORIES, CATEGORIES, emptyCategoryRecord } from '../../utils/categories';
import { amountToInput, formatCurrency, parseAmount, validateAmount } from '../../utils/currency';
import { formatMonthIn, formatMonthKey, formatMonthLower, shiftMonth } from '../../utils/date';
import { Modal } from '../ui/Modal';
import { AmountField, FormError } from '../ui/Field';
import { Button, IconButton } from '../ui/Button';
import { CategoryIcon } from '../ui/Misc';

type PlanInputs = Record<ExpenseCategory, string>;

/** Categories offered as a source for a missing limit, the freest first */
const MAX_SOURCES = 3;

function toInputs(plans: Record<ExpenseCategory, number> | undefined): PlanInputs {
  const src = plans ?? emptyCategoryRecord();
  return Object.fromEntries(ALL_CATEGORIES.map((k) => [k, amountToInput(src[k])])) as PlanInputs;
}

interface BudgetFormModalProps {
  /** Category whose limit the user came to revise: it is scrolled into view and ways to cover the gap are offered */
  focus?: ExpenseCategory;
  /** Purchase check that sent the user here: it is counted in the gap and reopened after saving or closing */
  purchase?: PurchaseDraft;
}

export function BudgetFormModal({ focus, purchase }: BudgetFormModalProps) {
  const openModal = useUIStore((s) => s.openModal);
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
  // A move only edits the form; nothing changes until the budget is saved
  const [moved, setMoved] = useState(false);
  const focusedRef = useRef<HTMLLIElement>(null);

  const changeMonth = (delta: number) => {
    const next = shiftMonth(month, delta);
    const b = budgets[budgetKey(familyId, next)];
    setMonth(next);
    setTotal(amountToInput(b?.totalAmount));
    setPlans(toInputs(b?.categoryPlans));
    setSubmitted(false);
    setMoved(false);
    save.reset();
  };

  const copyPrevious = () => {
    if (!previous) return;
    setTotal(amountToInput(previous.totalAmount));
    setPlans(toInputs(previous.categoryPlans));
  };

  const planErrors = Object.fromEntries(
    ALL_CATEGORIES.map((k) => [k, plans[k].trim() ? validateAmount(plans[k], { allowZero: true }) : null])
  ) as Record<ExpenseCategory, string | null>;
  const allocated = Math.round(ALL_CATEGORIES.reduce((s, k) => s + (parseAmount(plans[k]) ?? 0), 0) * 100) / 100;
  // The total is optional: limits for a few categories are enough, then the plan is their sum
  const autoTotal = !total.trim();
  const totalNum = autoTotal ? allocated : parseAmount(total) ?? 0;
  const unallocated = Math.round((totalNum - allocated) * 100) / 100;
  const overAllocated = unallocated < 0;
  const totalProblem = autoTotal
    ? allocated > 0
      ? null
      : 'Укажите общий бюджет или лимит хотя бы одной категории'
    : validateAmount(total) ?? (overAllocated ? 'Лимиты категорий больше общего бюджета — поднимите бюджет или уменьшите лимиты' : null);
  const totalError = submitted ? totalProblem : null;
  const committed = current.spent + current.reserved;

  // Gap of the focused category from the limits typed in the form, so it shrinks as the user edits them
  const used = (k: ExpenseCategory) => {
    const c = current.categories.find((x) => x.key === k)!;
    return c.spent + c.reserved + (purchase?.category === k ? purchase.amount ?? 0 : 0);
  };
  const freeIn = (k: ExpenseCategory) => round((parseAmount(plans[k]) ?? 0) - used(k));
  const focused = focus && month === viewedMonth ? focus : null;
  const need = focused ? Math.max(0, -freeIn(focused)) : 0;
  const sources = focused && need > 0
    ? ALL_CATEGORIES.filter((k) => k !== focused && (parseAmount(plans[k]) ?? 0) > 0 && freeIn(k) >= need).sort((a, b) => freeIn(b) - freeIn(a)).slice(0, MAX_SOURCES)
    : [];
  const unallocatedCovers = !autoTotal && unallocated >= need;
  const addTo = (k: ExpenseCategory, delta: number) =>
    setPlans((p) => ({ ...p, [k]: amountToInput(round((parseAmount(p[k]) ?? 0) + delta)) }));
  const cover = (from: ExpenseCategory | 'unallocated' | 'total') => {
    if (!focused) return;
    addTo(focused, need);
    if (from === 'total' && !autoTotal) setTotal(amountToInput(round(totalNum + need)));
    else if (from !== 'unallocated' && from !== 'total') addTo(from, -need);
    setMoved(true);
  };
  const leave = () => (purchase ? openModal({ type: 'purchaseCheck', prefill: purchase }) : closeModal());

  // Bring the category to fix into view; no focus, so a phone does not cover the suggestions with the keyboard
  useEffect(() => {
    focusedRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (totalProblem || ALL_CATEGORIES.some((k) => planErrors[k])) return;
    const categoryPlans = emptyCategoryRecord();
    for (const k of ALL_CATEGORIES) categoryPlans[k] = parseAmount(plans[k]) ?? 0;

    const res = await save.run({ monthKey: month, totalAmount: totalNum, categoryPlans }, `${requestId}:${month}`);
    if (!res.ok) return;
    leave();
    if (purchase && month === viewedMonth) {
      addToast('Лимиты сохранены — проверка покупки пересчитана');
    } else if (month !== viewedMonth) {
      addToast(`Бюджет на ${formatMonthLower(month)} сохранён`, 'success', { label: 'Показать', onClick: () => setMonthKey(month) });
    } else {
      addToast('Бюджет сохранён');
    }
  };

  return (
    <Modal
      size="lg"
      title={`Бюджет на ${formatMonthLower(month)}`}
      description="План — ориентир семьи, а не запрет: расходы можно вносить и сверх него. Лимиты достаточно задать только важным категориям."
      onClose={leave}
      footer={
        <div className="space-y-3">
          <div
            className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[15px] ${overAllocated ? 'text-danger font-medium' : 'text-ink-2'}`}
            role="status"
          >
            <span>
              {overAllocated ? 'Лимиты больше бюджета на' : autoTotal ? 'Общий бюджет = сумма лимитов' : 'Не распределено по категориям'}
            </span>
            <span className="tabular font-semibold">{formatCurrency(autoTotal ? allocated : Math.abs(unallocated))}</span>
            {overAllocated && (
              <button
                type="button"
                onClick={() => setTotal(amountToInput(allocated))}
                className="basis-full text-left text-sm font-semibold text-accent-ink hover:underline"
              >
                Поднять бюджет до {formatCurrency(allocated)}
              </button>
            )}
          </div>
          <Button type="submit" form="budget-form" fullWidth size="lg" loading={save.pending}>
            {moved ? 'Сохранить перенос лимитов' : 'Сохранить бюджет'}
          </Button>
          {purchase && (
            <Button variant="ghost" fullWidth size="sm" onClick={leave}>
              Вернуться к покупке без изменений
            </Button>
          )}
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
          placeholder={allocated > 0 ? amountToInput(allocated) : 'Необязательно'}
          emphasis
          error={totalError ?? (save.errorField === 'total' ? save.error : null)}
          hint={
            [
              autoTotal ? 'Можно не заполнять — тогда бюджет равен сумме лимитов категорий' : null,
              committed > 0 ? `Уже потрачено и зарезервировано: ${formatCurrency(committed)}` : null,
              previous ? `План ${formatMonthIn(prevMonth)}: ${formatCurrency(previous.totalAmount)}` : null,
            ]
              .filter(Boolean)
              .join('. ') || undefined
          }
        />

        <fieldset>
          <legend className="text-sm font-medium text-ink-2 mb-2">Лимиты по категориям — необязательно</legend>
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
                <li key={k} ref={k === focused ? focusedRef : undefined} className="py-3 scroll-mt-2">
                  <div className="flex items-start gap-3">
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
                  </div>
                  {k === focused && (
                    <CoverPanel
                      category={k}
                      need={need}
                      moved={moved}
                      purchase={purchase}
                      sources={sources.map((s) => ({ key: s, free: freeIn(s) }))}
                      unallocated={unallocatedCovers ? unallocated : null}
                      onCover={cover}
                    />
                  )}
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

interface CoverPanelProps {
  category: ExpenseCategory;
  need: number;
  moved: boolean;
  purchase?: PurchaseDraft;
  sources: { key: ExpenseCategory; free: number }[];
  /** Unallocated part of the plan when it covers the gap */
  unallocated: number | null;
  onCover: (from: ExpenseCategory | 'unallocated' | 'total') => void;
}

/** Ways to cover the gap of the category the user came to fix; each fills the form, saving confirms it */
function CoverPanel({ category, need, moved, purchase, sources, unallocated, onCover }: CoverPanelProps) {
  const label = CATEGORIES[category].label;
  if (need <= 0) {
    return (
      <p className="mt-2 sm:ml-11 flex items-start gap-2 rounded-xl bg-success-soft px-3.5 py-2.5 text-sm text-success" role="status">
        <Check size={16} className="shrink-0 mt-px" aria-hidden />
        <span>
          {moved ? 'Лимит покрывает' : 'Хватает на'} {purchase?.category === category ? 'расходы, платежи и покупку' : 'расходы и платежи'}.
          {moved && ' Перенос применится после сохранения.'}
        </span>
      </p>
    );
  }
  const option = 'w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm bg-surface hover:bg-accent-soft border border-line';
  return (
    <div className="mt-2 sm:ml-11 rounded-xl bg-warning-soft p-3.5">
      <p className="text-sm text-ink">
        В «{label}» не хватает <b className="tabular">{formatCurrency(need)}</b>
        {purchase?.category === category && purchase.amount ? ` с учётом покупки на ${formatCurrency(purchase.amount)}` : ''}. Увеличьте лимит
        или возьмите сумму:
      </p>
      <ul className="mt-2 space-y-1.5">
        {unallocated !== null && (
          <li>
            <button type="button" className={option} onClick={() => onCover('unallocated')}>
              <span className="inline-flex items-center gap-2"><ArrowRightLeft size={15} className="text-accent-ink" aria-hidden />Из нераспределённого</span>
              <span className="text-ink-3 tabular whitespace-nowrap">есть {formatCurrency(unallocated)}</span>
            </button>
          </li>
        )}
        {sources.map((s) => (
          <li key={s.key}>
            <button type="button" className={option} onClick={() => onCover(s.key)}>
              <span className="inline-flex items-center gap-2"><ArrowRightLeft size={15} className="text-accent-ink" aria-hidden />Из «{CATEGORIES[s.key].label}»</span>
              <span className="text-ink-3 tabular whitespace-nowrap">свободно {formatCurrency(s.free)}</span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" className={option} onClick={() => onCover('total')}>
            <span className="inline-flex items-center gap-2"><ArrowRightLeft size={15} className="text-accent-ink" aria-hidden />Увеличить и общий бюджет</span>
            <span className="text-ink-3 tabular whitespace-nowrap">+{formatCurrency(need)}</span>
          </button>
        </li>
      </ul>
      <p className="text-[13px] text-ink-3 mt-2">Выбор только заполнит форму — лимиты изменятся после сохранения.</p>
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
