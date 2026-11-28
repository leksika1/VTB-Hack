import { useLayoutEffect, useRef, useState } from 'react';
import { T } from '@admiral-ds/react-ui';
import type { AccountMemberSummary, AccountSummary } from '../../types';
import { useMonthChanged } from '../../hooks/useMonthChanged';
import { useAccountSummary } from '../../hooks/useServerData';
import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { formatBalance, formatCurrency, formatSigned } from '../../utils/currency';
import { formatDateShort, formatMonthGenitive, formatMonthLower, toMonthKey } from '../../utils/date';
import { MONTH_CHANGE_MS } from '../../utils/motion';
import { AmountRow, Avatar } from '../ui/Misc';
import { Button, IconButton } from '../ui/Button';
import { Card } from '../ui/Card';
import { Disclosure } from '../ui/Disclosure';
import { Calendar, Eye, Plus, Receipt, Refresh } from '../ui/icons';

export function FamilyAccountCard() {
  const month = useUIStore((s) => s.monthKey);
  const monthIn = useMonthChanged() ? 'animate-month-in' : '';
  const setTab = useUIStore((s) => s.setTab);
  const openModal = useUIStore((s) => s.openModal);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const account = useAccountSummary(month);
  const [amountsVisible, setAmountsVisible] = useState(true);
  const own = currentUserId ? account.data?.members.find((member) => member.memberId === currentUserId) : undefined;
  const due = own?.due ?? 0;
  const canTopUp = month === toMonthKey();
  const title = canTopUp ? 'На общем счёте' : `На общем счёте на конец ${formatMonthGenitive(month)}`;
  const heroRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const naturalHeight = useRef(0);
  const resizeAnimation = useRef<Animation | null>(null);

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

  const topUp = () => {
    if (due > 0) {
      openModal({ type: 'accountContribution', amount: own?.topUpSuggestion ?? due });
      return;
    }
    openModal({ type: 'accountContribution' });
  };

  return (
    <Card className="account-card">
      <section ref={heroRef} className="brand-surface account-hero overflow-clip" aria-labelledby="family-account-title"
        aria-busy={account.loading || undefined}>
        <div ref={contentRef} className={`account-hero-content ${canTopUp ? 'min-h-80' : 'min-h-64'}`}>
          <T as="h2" id="family-account-title" font="Header/H5" color="Special/Static White">{title}</T>

          {!account.data && account.loading && <AccountHeroSkeleton canTopUp={canTopUp} />}

          {!account.data && account.error && (
            <div role="alert" className="flex min-h-48 flex-col items-center justify-center text-center">
              <p className="font-semibold">Не удалось загрузить общий счёт</p>
              <p className="mt-1 max-w-sm text-sm text-ink-2">{account.error}</p>
              <Button className="mt-4" variant="inverse" size="sm" icon={<Refresh size={16} />}
                loading={account.loading} onClick={account.refetch}>Повторить</Button>
            </div>
          )}

          {account.data && (
            <>
              <div className="mt-4 flex items-center gap-2">
                <p key={month} className={`balance-number account-balance ${monthIn}`}>
                  <ConcealedAmount visible={amountsVisible}>{formatBalance(account.data.balance)}</ConcealedAmount>
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
                  <dt>Можно потратить</dt>
                  <dd><ConcealedAmount visible={amountsVisible}>{formatBalance(account.data.afterPlanned)}</ConcealedAmount></dd>
                </div>
                <div>
                  <dt>Запланировано</dt>
                  <dd><ConcealedAmount visible={amountsVisible}>{formatCurrency(account.data.planned)}</ConcealedAmount></dd>
                </div>
                <div>
                  <dt>Вам осталось внести</dt>
                  <dd><ConcealedAmount visible={amountsVisible}>{formatCurrency(due)}</ConcealedAmount></dd>
                </div>
              </dl>
              <div className="relative">
                <div className="account-top-up-motion pt-4" data-visible={canTopUp} inert={!canTopUp}>
                  <Button className="account-top-up" icon={<Plus size={16} />} onClick={topUp}>
                    {due > 0 ? 'Докинуть свою долю' : 'Пополнить общий счёт'}
                  </Button>
                </div>
              </div>
              {account.error && (
                <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                  <span>Не удалось обновить данные.</span>
                  <Button variant="inverse" size="sm" loading={account.loading} onClick={account.refetch}>Повторить</Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <div className="account-tools">
        <div className="account-actions">
          <Button variant="secondary" icon={<Plus size={21} />} onClick={() => openModal({ type: 'expenseForm' })}>
            Добавить покупку
          </Button>
          <Button variant="secondary" icon={<Calendar size={21} />} onClick={() => openModal({ type: 'paymentForm' })}>
            Добавить платёжку
          </Button>
          <Button variant="secondary" icon={<Receipt size={21} />} onClick={() => setTab('records')}>
            Из покупок или выписки
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AccountHeroSkeleton({ canTopUp }: { canTopUp: boolean }) {
  return (
    <div className="animate-pulse" aria-label="Загрузка общего счёта">
      <div className="mt-5 h-12 w-52 max-w-full rounded-control bg-white/20" />
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="h-14 rounded-2xl bg-white/15" />
        <div className="h-14 rounded-2xl bg-white/15" />
        <div className="col-span-2 h-14 rounded-2xl bg-white/15 sm:col-span-1" />
      </div>
      {canTopUp && <div className="mt-4 h-12 w-52 max-w-full rounded-control bg-white/20" />}
    </div>
  );
}

function ConcealedAmount({ visible, children }: { visible: boolean; children: string }) {
  return <>
    <span className={visible ? undefined : 'amount-concealed'} aria-hidden={!visible || undefined}>{children}</span>
    {!visible && <span className="sr-only">Сумма скрыта</span>}
  </>;
}

export function FamilyContributionsCard({ month }: { month: string }) {
  const family = useFamilyStore((s) => s.family);
  const account = useAccountSummary(month);
  const [membersOpen, setMembersOpen] = useState(true);

  return (
    <Card className="px-3 py-3">
      <Disclosure title={`Взносы за ${formatMonthLower(month)}`} open={membersOpen} onOpenChange={setMembersOpen}
        className="select-none">
        {account.loading && !account.data && <ContributionSkeleton />}
        {account.error && !account.data && (
          <InlineLoadError message={account.error} loading={account.loading} onRetry={account.refetch} />
        )}
        {account.data && (
          <>
            <ul key={month} className="space-y-2 pt-1">
              {account.data.members.map((member) => (
                <CompactMemberRow key={member.memberId} member={member}
                  color={family?.members.find((item) => item.id === member.memberId)?.color} />
              ))}
            </ul>
            <div className="mt-3 border-t border-line pt-2">
              <ContributionHistory summary={account.data} />
            </div>
          </>
        )}
      </Disclosure>
    </Card>
  );
}

function CompactMemberRow({ member, color }: { member: AccountMemberSummary; color?: string }) {
  const owes = member.status === 'owes';
  const tone = owes ? 'text-danger' : 'text-success';
  // Процент от своей доли (а не от всех взносов семьи): внесено на счёт + оплачено лично.
  const covered = member.share > 0
    ? `внёс ${formatPercent(Math.round(((member.contributed + member.paidPersonally) / member.share) * 100))} своей доли`
    : 'без доли в тратах';
  return (
    <li className="flex items-center gap-3 rounded-control bg-surface px-3 py-2">
      <Avatar user={{ name: member.name, color: color ?? 'var(--accent)' }} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{member.name}</p>
        <p className={`text-sm ${tone}`}>{covered}</p>
      </div>
      <p className={`shrink-0 text-right text-sm font-medium tabular ${tone}`}>
        осталось {formatCurrency(member.due)}
      </p>
    </li>
  );
}

function ContributionHistory({ summary }: { summary: AccountSummary }) {
  const family = useFamilyStore((s) => s.family);
  return (
    <Disclosure title="Пополнения за месяц" className="select-none">
      {summary.contributions.length > 0 ? (
        <div className="pt-1">
          {summary.contributions.map((item) => (
            <AmountRow key={item.id}
              label={family?.members.find((member) => member.id === item.memberId)?.name ?? 'Участник'}
              value={formatSigned(item.amount)} hint={formatDateShort(item.date)} />
          ))}
        </div>
      ) : <p className="pt-1 text-sm text-ink-2">Пополнений в этом месяце пока нет.</p>}
    </Disclosure>
  );
}

/** Detailed contribution breakdown stays on Analytics. */
export function FamilyAccountBreakdown({ month }: { month: string }) {
  const family = useFamilyStore((s) => s.family);
  const account = useAccountSummary(month);

  return (
    <Card className="px-5 py-3">
      <Disclosure title="Взносы и доли" className="select-none">
        {account.loading && !account.data && <ContributionSkeleton />}
        {account.error && !account.data && (
          <InlineLoadError message={account.error} loading={account.loading} onRetry={account.refetch} />
        )}
        {account.data && (
          <>
            <ul key={month} className="space-y-2 pt-3">
              {account.data.members.map((member) => (
                <li key={member.memberId} className="flex items-center gap-3 rounded-control bg-surface-muted px-3 py-2">
                  <Avatar user={{
                    name: member.name,
                    color: family?.members.find((item) => item.id === member.memberId)?.color ?? 'var(--accent)',
                  }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="font-medium wrap-anywhere">{member.name}</p>
                      <p className="font-medium tabular">К внесению {formatCurrency(member.due)}</p>
                    </div>
                    <p className="text-sm text-ink-2">
                      Доля {formatCurrency(member.share)} ({formatPercent(member.sharePercent)}), внесено{' '}
                      {formatCurrency(member.contributed)} ({formatPercent(member.contributionPercent)})
                      {!!member.paidPersonally && `, оплачено лично ${formatCurrency(member.paidPersonally)}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <ContributionHistory summary={account.data} />
            </div>
          </>
        )}
      </Disclosure>
    </Card>
  );
}

function ContributionSkeleton() {
  return (
    <div className="space-y-2 pt-2" aria-label="Загрузка взносов">
      <div className="h-14 animate-pulse rounded-control bg-surface" />
      <div className="h-14 animate-pulse rounded-control bg-surface" />
    </div>
  );
}

function InlineLoadError({ message, loading, onRetry }: {
  message: string;
  loading: boolean;
  onRetry: () => Promise<void>;
}) {
  return (
    <div role="alert" className="py-3 text-sm">
      <p className="text-danger">{message}</p>
      <Button className="mt-2" variant="secondary" size="sm" icon={<Refresh size={15} />}
        loading={loading} onClick={onRetry}>Повторить</Button>
    </div>
  );
}

const percentage = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const formatPercent = (amount: number) => `${percentage.format(amount)}%`;
