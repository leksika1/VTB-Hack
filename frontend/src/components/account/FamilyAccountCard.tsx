import { useMemo, useState } from 'react';
import { T } from '@admiral-ds/react-ui';
import { computeFamilyAccount } from '../../domain/familyAccount';
import { useDataStore } from '../../store/dataStore';
import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { formatBalance, formatCurrency, formatSigned } from '../../utils/currency';
import { formatDateShort, formatMonthIn, toMonthKey } from '../../utils/date';
import { AmountRow, Avatar } from '../ui/Misc';
import { Button, IconButton } from '../ui/Button';
import { Card } from '../ui/Card';
import { Disclosure } from '../ui/Disclosure';
import { Calendar, Eye, Plus, Receipt } from '../ui/icons';

export function FamilyAccountCard() {
  const month = useUIStore((s) => s.monthKey);
  const openModal = useUIStore((s) => s.openModal);
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const contributions = useDataStore((s) => s.accountContributions);
  const expenses = useDataStore((s) => s.expenses);
  const payments = useDataStore((s) => s.payments);
  const account = useMemo(() => computeFamilyAccount(month, expenses, payments, contributions),
    [month, expenses, payments, contributions]);
  const [amountsVisible, setAmountsVisible] = useState(true);
  const own = currentUserId ? account.members.get(currentUserId) : undefined;
  const due = Math.max(0, -(own?.balance ?? 0));
  const canTopUp = month === toMonthKey();
  const recent = contributions.filter(({ date }) => date.startsWith(month)).slice(0, 4);

  return (
    <Card className="account-card">
      <section className="brand-surface account-hero" aria-labelledby="family-account-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <T as="h2" id="family-account-title" font="Subtitle/Subtitle 2" color="Special/Static White">Общий счёт</T>
          <span className="account-tag">Демо-счёт</span>
        </div>
        <p className="mt-5 text-sm text-ink-2">
          {account.available < 0 ? 'Не хватает на платежи' : 'Можно потратить'} {formatMonthIn(month)}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <p className="balance-number account-balance">
            {amountsVisible ? formatCurrency(Math.abs(account.available)) : 'Сумма скрыта'}
          </p>
          <IconButton
            label={amountsVisible ? 'Скрыть суммы счёта' : 'Показать суммы счёта'}
            className="account-visibility !size-9 !rounded-full"
            onClick={() => setAmountsVisible((visible) => !visible)}
          >
            <Eye size={20} />
          </IconButton>
        </div>
        <dl className="account-metrics">
          <div>
            <dt>На общем счёте</dt>
            <dd>{amountsVisible ? formatBalance(account.balance) : 'Скрыто'}</dd>
          </div>
          <div>
            <dt>Резерв на платежи</dt>
            <dd>{amountsVisible ? formatCurrency(account.reserved) : 'Скрыто'}</dd>
          </div>
          <div>
            <dt>Ваш баланс по взносам</dt>
            <dd>{amountsVisible ? formatSigned(own?.balance ?? 0) : 'Скрыто'}</dd>
          </div>
        </dl>
        {canTopUp && (
          <Button className="account-top-up mt-4" icon={<Plus size={16} />}
            onClick={() => openModal({ type: 'accountContribution', amount: due })}>
            {due > 0 ? 'Докинуть свою долю' : 'Пополнить общий счёт'}
          </Button>
        )}
      </section>

      <div className="account-tools">
        <div className="account-actions">
          <Button variant="secondary" icon={<Plus size={21} />} onClick={() => openModal({ type: 'expenseForm' })}>
            Записать расход
          </Button>
          <Button variant="secondary" icon={<Calendar size={21} />} onClick={() => openModal({ type: 'paymentForm' })}>
            Запланировать платёж
          </Button>
          <Button variant="secondary" icon={<Receipt size={21} />} onClick={() => openModal({ type: 'personalPurchases' })}>
            Из покупок или выписки
          </Button>
        </div>
        <Disclosure title="Взносы и доли" className="mt-3 select-none">
          <ul className="space-y-2 pt-3">
            {family?.members.map((member) => {
              const info = account.members.get(member.id);
              return (
                <li key={member.id} className="flex items-center gap-3 rounded-control bg-surface-muted px-3 py-2">
                  <Avatar user={member} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="font-medium wrap-anywhere">{member.name}</p>
                      {member.role !== 'child' && <p className="font-medium tabular">{amountsVisible ? formatSigned(info?.balance ?? 0) : 'Скрыто'}</p>}
                    </div>
                    {member.role === 'child' ? <p className="text-sm text-ink-2">Не участвует в делении</p> : amountsVisible && (
                      <p className="text-sm text-ink-2">Внесено {formatCurrency(info?.contributed ?? 0)}, доля {formatCurrency(info?.share ?? 0)}
                        {!!info?.paidPersonally && `, оплачено лично ${formatCurrency(info.paidPersonally)}`}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {amountsVisible && recent.length > 0 && (
            <div className="mt-4">
              <T as="h3" font="Subtitle/Subtitle 2">Пополнения за месяц</T>
              {recent.map((item) => (
                <AmountRow key={item.id} label={family?.members.find((member) => member.id === item.memberId)?.name ?? 'Участник'}
                  value={formatSigned(item.amount)} hint={formatDateShort(item.date)} />
              ))}
            </div>
          )}
        </Disclosure>
      </div>
    </Card>
  );
}
