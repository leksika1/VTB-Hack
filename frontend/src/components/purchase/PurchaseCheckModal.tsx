import { useMemo, useState } from 'react';
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import type { ExpenseCategory } from '../../types';
import { checkPurchase, type PurchaseCheck } from '../../domain/budget';
import { useMonthSummary } from '../../hooks/useMonthSummary';
import { useUIStore } from '../../store/uiStore';
import { CATEGORIES } from '../../utils/categories';
import { formatBalance, formatCurrency, parseAmount, validateAmount } from '../../utils/currency';
import { formatDateShort, formatMonthLower, toMonthKey } from '../../utils/date';
import { Modal } from '../ui/Modal';
import { AmountField, Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { CategoryPicker } from '../ui/CategoryPicker';
import { AmountRow } from '../ui/Misc';

export function PurchaseCheckModal() {
  const closeModal = useUIStore((s) => s.closeModal);
  const openModal = useUIStore((s) => s.openModal);
  const monthKey = useUIStore((s) => s.monthKey);
  const summary = useMonthSummary();

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | null>(null);

  const value = parseAmount(amount);
  const amountError = amount.trim() ? validateAmount(amount) : null;
  const result = useMemo(
    () => (value && value > 0 && !amountError ? checkPurchase(summary, value, category) : null),
    [summary, value, category, amountError]
  );

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
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={closeModal}>
            Закрыть
          </Button>
          <Button
            className="flex-1"
            disabled={!result}
            onClick={() =>
              openModal({ type: 'expenseForm', prefill: { title: title.trim() || undefined, amount: value ?? undefined, category: category ?? undefined } })
            }
          >
            Записать как расход
          </Button>
        </div>
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
        <Field label="Что покупаем (необязательно)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Холодильник" maxLength={120} />
        <CategoryPicker value={category} onChange={setCategory} label="Из какой категории (необязательно)" />

        <div aria-live="polite">
          {result ? (
            <PurchaseResult result={result} />
          ) : (
            <p className="text-[15px] text-ink-2 rounded-xl bg-surface-muted p-4">
              Сейчас свободно по плану <b className="text-ink tabular">{formatBalance(summary.freeByPlan)}</b>. Введите сумму, чтобы увидеть, что
              останется после покупки.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

const VERDICT = {
  ok: { icon: CircleCheck, tone: 'bg-success-soft text-success', title: 'Покупка помещается в план' },
  tight: { icon: TriangleAlert, tone: 'bg-warning-soft text-warning', title: 'Хватает, но запас будет маленьким' },
  'category-over': { icon: TriangleAlert, tone: 'bg-warning-soft text-warning', title: 'В бюджет помещается, но категория выйдет за лимит' },
  'not-enough': { icon: CircleAlert, tone: 'bg-danger-soft text-danger', title: 'Не хватает с учётом обязательных платежей' },
} as const;

function PurchaseResult({ result }: { result: PurchaseCheck }) {
  const v = VERDICT[result.verdict];
  const Icon = v.icon;
  const cat = result.category;

  let explanation: string;
  switch (result.verdict) {
    case 'not-enough':
      explanation = `Не хватит ${formatCurrency(-result.freeAfter)}. Можно отложить покупку, пересмотреть лимиты или перенести её на следующий месяц.`;
      break;
    case 'category-over':
      explanation = `В категории «${cat ? CATEGORIES[cat.key].label : ''}» будет перерасход ${formatCurrency(-(result.categoryLeftAfter ?? 0))}. Можно взять из другой категории, изменив лимиты.`;
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
        <div>
          <p className="font-semibold">{v.title}</p>
          <p className="text-[15px] text-ink mt-0.5">{explanation}</p>
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
        {cat && result.categoryLeftAfter === null && (
          <p className="text-sm text-ink-3 py-1.5">Для категории «{CATEGORIES[cat.key].label}» лимит не задан — проверяем только общий план.</p>
        )}

        <div className="mt-3 pt-3 border-t border-line">
          <p className="font-medium text-ink mb-1.5">
            {result.reservedPayments.length > 0 ? 'Учтены предстоящие платежи' : 'Предстоящих платежей в этом месяце нет'}
          </p>
          {result.reservedPayments.length > 0 && (
            <ul className="space-y-1 text-sm">
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
          )}
        </div>
      </div>
    </div>
  );
}
