import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { T } from '@admiral-ds/react-ui';
import { useMonthChanged } from '../../hooks/useMonthChanged';
import { useAccountSummary } from '../../hooks/useServerData';
import { computeFamilyAccount } from '../../domain/familyAccount';
import { useDataStore } from '../../store/dataStore';
import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { formatBalance, formatCurrency, formatSigned } from '../../utils/currency';
import { formatDateShort, formatMonthIn, toMonthKey } from '../../utils/date';
import { MONTH_CHANGE_MS } from '../../utils/motion';
import { AmountRow, Avatar } from '../ui/Misc';
import { Button, IconButton } from '../ui/Button';
import { Card } from '../ui/Card';
import { Disclosure } from '../ui/Disclosure';
import { Calendar, Eye, Plus, Receipt } from '../ui/icons';

export function FamilyAccountCard() {
  const month = useUIStore((s) => s.monthKey);
  const monthIn = useMonthChanged() ? 'animate-month-in' : '';
  const setTab = useUIStore((s) => s.setTab);
  const openModal = useUIStore((s) => s.openModal);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const account = useFamilyAccount(month);
  const serverSummary = useAccountSummary(month);
  const [amountsVisible, setAmountsVisible] = useState(true);
  const own = currentUserId ? account.members.get(currentUserId) : undefined;
  const due = own?.due ?? 0;
  const canTopUp = month === toMonthKey();
  const heroRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const naturalHeight = useRef(0);
  const resizeAnimation = useRef<Animation | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV || !serverSummary.data) return;
    // Realtime параллельно обновляет /state и v2-сводку — сравниваем после завершения обоих запросов.
    const timer = window.setTimeout(() => {
      const backend = serverSummary.data;
      if (!backend) return;
      const frontend = {
        balance: account.balance,
        planned: account.reserved,
        afterPlanned: account.available,
        members: Object.fromEntries([...account.members].map(([id, value]) => [id, value])),
      };
      const differs = (left: number, right: number) => Math.abs(left - right) >= 0.01;
      const mismatch = differs(frontend.balance, backend.balance)
        || differs(frontend.planned, backend.planned)
        || differs(frontend.afterPlanned, backend.afterPlanned)
        || backend.members.some((member) => {
          const local = account.members.get(member.memberId);
          return differs(local?.share ?? 0, member.share)
            || differs(local?.contributed ?? 0, member.contributed)
            || differs(local?.paidPersonally ?? 0, member.paidPersonally)
            || differs(local?.due ?? 0, member.due);
        });
      if (mismatch) console.warn('Расчёт общего счёта на фронте расходится с ответом сервера', { frontend, backend });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [account, serverSummary.data]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      naturalHeight.current = content.getBoundingClientRect().height;
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      resizeAnimation.current?.cancel();
    };
  }, []);

  useLayoutEffect(() => {
    const hero = heroRef.current;
    const content = contentRef.current;
    if (!hero || !content) return;

    // Continue from the visible height if another month is picked mid-animation.
    const from = resizeAnimation.current?.playState === 'running'
      ? hero.getBoundingClientRect().height
      : naturalHeight.current;
    const to = content.getBoundingClientRect().height;
    naturalHeight.current = to;
    resizeAnimation.current?.cancel();
    if (!from || Math.abs(from - to) < 0.5 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    resizeAnimation.current = hero.animate({ height: [`${from}px`, `${to}px`] }, {
      duration: MONTH_CHANGE_MS,
      easing: getComputedStyle(hero).getPropertyValue('--ease-in-out').trim(),
    });
  }, [month]);

  return (
    <Card className="account-card">
      <section ref={heroRef} className="brand-surface account-hero overflow-clip" aria-labelledby="family-account-title">
        <div ref={contentRef} className="account-hero-content">
          <T as="h2" id="family-account-title" font="Subtitle/Subtitle 2" color="Special/Static White">Общий счёт</T>
          <p key={`label-${month}`} className={`mt-5 text-sm text-ink-2 ${monthIn}`}>
            {canTopUp ? 'Текущий остаток' : `Остаток ${formatMonthIn(month)}`}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <p key={month} className={`balance-number account-balance ${monthIn}`}>
              <span className={amountsVisible ? undefined : 'amount-concealed'} aria-hidden={!amountsVisible || undefined}>
                {formatBalance(account.balance)}
              </span>
              {!amountsVisible && <span className="sr-only">Сумма скрыта</span>}
            </p>
            <IconButton
              label={amountsVisible ? 'Скрыть суммы счёта' : 'Показать суммы счёта'}
              className="account-visibility !size-9 !rounded-full"
              onClick={() => setAmountsVisible((visible) => !visible)}
            >
              <Eye size={20} />
            </IconButton>
          </div>
          <dl key={month} className={`account-metrics ${monthIn}`}>
            <div>
              <dt>После запланированных</dt>
              <dd><ConcealedAmount visible={amountsVisible}>{formatBalance(account.available)}</ConcealedAmount></dd>
            </div>
            <div>
              <dt>Запланировано</dt>
              <dd><ConcealedAmount visible={amountsVisible}>{formatCurrency(account.reserved)}</ConcealedAmount></dd>
            </div>
            <div>
              <dt>Вам осталось внести</dt>
              <dd><ConcealedAmount visible={amountsVisible}>{formatCurrency(due)}</ConcealedAmount></dd>
            </div>
          </dl>
          <div className="relative">
            <div className="account-top-up-motion pt-4" data-visible={canTopUp} inert={!canTopUp}>
              <Button className="account-top-up" icon={<Plus size={16} />}
                onClick={() => openModal({ type: 'accountContribution', amount: due })}>
                Пополнить общий счёт
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="account-tools">
        <div className="account-actions">
          <Button variant="secondary" icon={<Plus size={21} />} onClick={() => openModal({ type: 'expenseForm' })}>
            Записать покупку
          </Button>
          <Button variant="secondary" icon={<Calendar size={21} />} onClick={() => openModal({ type: 'paymentForm' })}>
            Запланировать платёж
          </Button>
          <Button variant="secondary" icon={<Receipt size={21} />} onClick={() => setTab('records')}>
            Из покупок или выписки
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ConcealedAmount({ visible, children }: { visible: boolean; children: string }) {
  return <>
    <span className={visible ? undefined : 'amount-concealed'} aria-hidden={!visible || undefined}>{children}</span>
    {!visible && <span className="sr-only">Сумма скрыта</span>}
  </>;
}

function useFamilyAccount(month: string) {
  const contributions = useDataStore((s) => s.accountContributions);
  const expenses = useDataStore((s) => s.expenses);
  const payments = useDataStore((s) => s.payments);
  return useMemo(() => computeFamilyAccount(month, expenses, payments, contributions),
    [month, expenses, payments, contributions]);
}

export function FamilyAccountBreakdown({ month }: { month: string }) {
  const family = useFamilyStore((s) => s.family);
  const contributions = useDataStore((s) => s.accountContributions);
  const account = useFamilyAccount(month);
  const recent = contributions.filter(({ date }) => date.startsWith(month)).slice(0, 4);

  return (
    <Card className="px-5 py-3">
      <Disclosure title="Взносы и доли" className="select-none">
        <ul key={month} className="space-y-2 pt-3">
          {family?.members.map((member) => {
            const info = account.members.get(member.id);
            return (
              <li key={member.id} className="flex items-center gap-3 rounded-control bg-surface-muted px-3 py-2">
                <Avatar user={member} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-medium wrap-anywhere">{member.name}</p>
                    <p className="font-medium tabular">{`К внесению ${formatCurrency(info?.due ?? 0)}`}</p>
                  </div>
                  <p className="text-sm text-ink-2">Доля {formatCurrency(info?.share ?? 0)} ({formatPercent(info?.percent ?? 0)}), внесено {formatCurrency(info?.contributed ?? 0)} ({formatPercent(info?.contributedPercent ?? 0)})
                    {!!info?.paidPersonally && `, оплачено лично ${formatCurrency(info.paidPersonally)}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        {recent.length > 0 && (
          <div className="mt-4">
            <T as="h3" font="Subtitle/Subtitle 2">Пополнения за месяц</T>
            {recent.map((item) => (
              <AmountRow key={item.id} label={family?.members.find((member) => member.id === item.memberId)?.name ?? 'Участник'}
                value={formatSigned(item.amount)} hint={formatDateShort(item.date)} />
            ))}
          </div>
        )}
      </Disclosure>
    </Card>
  );
}

const percentage = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const formatPercent = (amount: number) => `${percentage.format(amount)}%`;
