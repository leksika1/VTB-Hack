import { useMemo, useRef, useState } from 'react';
import { CalendarPlus, ChevronDown, ReceiptText, Scale, TriangleAlert } from 'lucide-react';
import type { ExpenseCategory } from '../../types';
import { categoryShortages, checkPurchase, type CategorySummary, type PurchaseCheck } from '../../domain/budget';
import { useMonthSummary } from '../../hooks/useMonthSummary';
import { useUIStore, type PurchaseDraft } from '../../store/uiStore';
import { CATEGORIES } from '../../utils/categories';
import { amountToInput, formatBalance, formatCurrency, parseAmount, validateAmount } from '../../utils/currency';
import { formatDateShort, formatMonthLower, plural, toMonthKey } from '../../utils/date';
import { Modal } from '../ui/Modal';
import { VERDICT } from './verdict';
import { AmountField } from '../ui/Field';
import { Button } from '../ui/Button';
import { CategoryPicker } from '../ui/CategoryPicker';
import { AmountRow } from '../ui/Misc';

export function PurchaseCheckModal({ prefill }: { prefill?: PurchaseDraft }) {
  const closeModal = useUIStore((s) => s.closeModal);
  const openModal = useUIStore((s) => s.openModal);
  const monthKey = useUIStore((s) => s.monthKey);
  const summary = useMonthSummary();

  const [amount, setAmount] = useState(amountToInput(prefill?.amount));
  const [category, setCategory] = useState<ExpenseCategory | null>(prefill?.category ?? null);
  const resultRef = useRef<HTMLDivElement>(null);

  const value = parseAmount(amount);
  const amountError = amount.trim() ? validateAmount(amount) : null;
  const result = useMemo(
    () => (value && value > 0 && !amountError ? checkPurchase(summary, value, category) : null),
    [summary, value, category, amountError]
  );
  const draft: PurchaseDraft = { amount: value ?? undefined, category: category ?? undefined };
  // The checked category speaks for itself in the verdict; the others are reported separately
  const otherShortages = categoryShortages(summary).filter((c) => c.key !== category);

  if (!summary.hasBudget) {
    return (
      <Modal title="Проверить покупку" onClose={closeModal}>
        <p className="text-ink-2">
          Чтобы понять, хватит ли денег, нужен план на {formatMonthLower(monthKey)}: общий бюджет и лимиты по категориям.
        </p>
        <Button className="mt-4" onClick={() => openModal({ type: 'budgetForm' })}>
          Задать бюджет
        </Button>
      </Modal>
    );
  }

  const reviseLimit = (c: CategorySummary) => openModal({ type: 'budgetForm', focus: c.key, purchase: draft });

  return (
    <Modal
      size="lg"
      title="Проверить покупку"
      description={
        <>
          Посчитаем по плану на {formatMonthLower(monthKey)} с учётом уже сделанных расходов и предстоящих платежей.
          {monthKey !== toMonthKey() && <b className="font-medium text-ink"> Это не текущий месяц.</b>}
        </>
      }
      onClose={closeModal}
      footer={
        <Button variant="secondary" fullWidth onClick={closeModal}>
          Готово
        </Button>
      }
    >
      <div className="space-y-4">
        <AmountField
          label="Сколько стоит покупка"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Например, 60 000"
          emphasis
          error={amountError}
          data-autofocus
        />

        {/* The overall answer comes right after the amount; the category is an optional refinement below */}
        <div aria-live="polite" ref={resultRef} className="scroll-mt-4">
          {result ? (
            <PurchaseResult result={result} onRebalance={reviseLimit} />
          ) : (
            <p className="text-[15px] text-ink-2 rounded-xl bg-surface-muted p-4">
              Сейчас свободно по плану <b className="text-ink tabular">{formatBalance(summary.freeByPlan)}</b>. Введите сумму, чтобы увидеть, что
              останется после покупки.
            </p>
          )}
        </div>

        {result && otherShortages.length > 0 && (
          <ShortagesNote shortages={otherShortages} onRevise={reviseLimit} />
        )}

        <CategoryPicker
          compact
          value={category}
          onChange={(c) => {
            setCategory(c);
            // The picker sits below the answer; bring the updated answer back into view
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            resultRef.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
          }}
          noneLabel="Не уточнять"
          label="Уточнить категорию — проверим и её лимит"
        />

        {/* Checking a purchase and recording one are different actions: ask first, then open a prefilled form */}
        {result && (
          <div className="rounded-xl border border-line p-4">
            <p className="font-medium text-ink">Покупка уже совершена?</p>
            <p className="text-sm text-ink-2 mt-0.5">
              Если да — запишем расход, укажете название и дату. Если только собираетесь — сумму можно зарезервировать заранее.
            </p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="sm:flex-1"
                icon={<ReceiptText size={16} />}
                onClick={() => openModal({ type: 'expenseForm', prefill: draft })}
              >
                Да, записать расход
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="sm:flex-1"
                icon={<CalendarPlus size={16} />}
                onClick={() => openModal({ type: 'paymentForm', planned: true, prefill: draft })}
              >
                Нет, запланировать
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Categories that already lack money in the plan, regardless of the checked purchase */
function ShortagesNote({ shortages, onRevise }: { shortages: CategorySummary[]; onRevise: (c: CategorySummary) => void }) {
  const worst = shortages[0];
  return (
    <div className="flex items-start gap-3 rounded-xl bg-warning-soft p-3.5 text-[15px]">
      <TriangleAlert size={18} className="shrink-0 mt-0.5 text-warning" aria-hidden />
      <div className="min-w-0">
        <p className="text-ink">
          {shortages.length > 1 ? (
            <>
              Отдельно: в плане уже {shortages.length} {plural(shortages.length, 'категория', 'категории', 'категорий')} с дефицитом, больше всего
              не хватает в «{CATEGORIES[worst.key].label}» — <b className="tabular">{formatCurrency(-worst.left)}</b>.
            </>
          ) : (
            <>
              Отдельно: в категории «{CATEGORIES[worst.key].label}» уже не хватает <b className="tabular">{formatCurrency(-worst.left)}</b> на
              расходы и платежи.
            </>
          )}
        </p>
        <button type="button" onClick={() => onRevise(worst)} className="mt-1 text-sm font-semibold text-accent-ink hover:underline">
          Пересмотреть лимит «{CATEGORIES[worst.key].label}»
        </button>
      </div>
    </div>
  );
}

function PurchaseResult({ result, onRebalance }: { result: PurchaseCheck; onRebalance: (c: CategorySummary) => void }) {
  const v = VERDICT[result.verdict];
  const Icon = v.icon;
  const cat = result.category;
  const fits = result.verdict === 'ok' || result.verdict === 'tight';

  // Without a category limit only the overall plan is checked — the answer must not sound more certain than that
  const overallOnly = fits && result.categoryLeftAfter === null;
  const title = !overallOnly ? v.title : result.verdict === 'tight' ? 'В общий лимит помещается, но запас маленький' : 'В общий лимит помещается';
  const scope = !overallOnly ? null : cat ? 'У категории нет лимита — проверен только общий план.' : 'Лимит категории не проверен.';

  let explanation: string;
  switch (result.verdict) {
    case 'not-enough':
      explanation = `Не хватит ${formatCurrency(-result.freeAfter)}. Можно отложить покупку, пересмотреть лимиты или перенести её на следующий месяц.`;
      break;
    case 'category-over':
      explanation = `В категории «${cat ? CATEGORIES[cat.key].label : ''}» будет перерасход ${formatCurrency(-(result.categoryLeftAfter ?? 0))}. Можно взять эту сумму из другой категории.`;
      break;
    case 'tight':
      explanation = `После покупки останется ${formatCurrency(result.freeAfter)} на все незапланированные траты до конца месяца.`;
      break;
    default:
      explanation = `После покупки и всех предстоящих платежей останется ${formatCurrency(result.freeAfter)}.`;
  }

  return (
    <div className="rounded-2xl border border-line overflow-hidden animate-fade-in">
      <div className={`flex items-start gap-3 p-4 ${v.tone}`}>
        <Icon size={22} className="shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold">
            {title}
            {scope && (
              <>
                . <span className="font-normal">{scope}</span>
              </>
            )}
          </p>
          <p className="text-[15px] text-ink mt-0.5">{explanation}</p>
          {result.verdict === 'category-over' && cat && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2.5"
              icon={<Scale size={16} />}
              onClick={() => onRebalance(cat)}
            >
              Перераспределить лимиты
            </Button>
          )}
        </div>
      </div>
      <div className="p-4 text-[15px]">
        <AmountRow label="Свободно по плану сейчас" value={formatBalance(result.freeBefore)} />
        <AmountRow label="Покупка" value={`−${formatCurrency(result.amount)}`} />
        <div className="border-t border-line my-1" />
        <AmountRow
          label={result.freeAfter < 0 ? 'Не хватит' : 'Останется свободно'}
          value={formatCurrency(Math.abs(result.freeAfter))}
          strong
          tone={result.freeAfter < 0 ? 'danger' : undefined}
        />
        {cat && result.categoryLeftAfter !== null && (
          <AmountRow
            label={`Лимит «${CATEGORIES[cat.key].label}» после покупки`}
            hint={`Сейчас осталось ${formatBalance(cat.left)} с учётом платежей`}
            value={formatBalance(result.categoryLeftAfter)}
            tone={result.categoryLeftAfter < 0 ? 'danger' : undefined}
          />
        )}

        {result.reservedPayments.length > 0 ? (
          <details className="group mt-3 pt-3 border-t border-line">
            <summary className="flex items-center justify-between gap-3 cursor-pointer list-none font-medium text-ink [&::-webkit-details-marker]:hidden">
              <span>
                Учтены {result.reservedPayments.length}{' '}
                {plural(result.reservedPayments.length, 'предстоящий платёж', 'предстоящих платежа', 'предстоящих платежей')}
              </span>
              <ChevronDown size={18} className="shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ul className="space-y-1 text-sm mt-2">
              {result.reservedPayments.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 text-ink-2">
                  <span className="flex gap-3 min-w-0">
                    <span className="text-ink-3 w-[5.5rem] shrink-0">{formatDateShort(p.dueDate)}</span>
                    <span className="truncate">{p.title}</span>
                  </span>
                  <span className="tabular whitespace-nowrap">{formatCurrency(p.amount)}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="mt-3 pt-3 border-t border-line text-sm text-ink-2">Предстоящих платежей в этом месяце нет</p>
        )}
      </div>
    </div>
  );
}
