import { useMemo } from 'react';
import { Accordion, AccordionItem, T } from '@admiral-ds/react-ui';
import { computeFamilyAccount } from '../../domain/familyAccount';
import { useDataStore } from '../../store/dataStore';
import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { formatBalance, formatCurrency, formatSigned } from '../../utils/currency';
import { formatDateShort, formatMonthIn, toMonthKey } from '../../utils/date';
import { AmountRow, Badge } from '../ui/Misc';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Calendar, Plus } from '../ui/icons';

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
  const own = currentUserId ? account.members.get(currentUserId) : undefined;
  const due = Math.max(0, -(own?.balance ?? 0));
  const canTopUp = month === toMonthKey();
  const recent = contributions.filter(({ date }) => date.startsWith(month)).slice(0, 4);

  return (
    <Card className="p-5 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <T as="h2" font="Header/H5">Общий счёт</T>
        <Badge tone="neutral">Демо-счёт</Badge>
      </header>
      <div className="rounded-card brand-surface p-4 sm:p-5">
        <T as="p" font="Body/Body 1 Short" color="Special/Static White">
          {account.available < 0 ? 'Не хватает на платежи' : 'Можно потратить'} {formatMonthIn(month)}
        </T>
        <T as="p" font="Header/H2" color="Special/Static White" className="mt-1 tabular">
          {formatCurrency(Math.abs(account.available))}
        </T>
        <div className="mt-2 text-sm">
          <AmountRow label="На общем счёте" value={formatBalance(account.balance)} />
          <AmountRow label="Резерв на платежи" value={formatCurrency(account.reserved)} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-2">Ваш баланс по взносам</p>
          <p className="font-semibold tabular">{formatSigned(own?.balance ?? 0)}</p>
          {due > 0 && <p className="mt-1 text-sm text-ink-2">Нужно докинуть {formatCurrency(due)}</p>}
        </div>
        {canTopUp && (
          <Button icon={<Plus size={16} />} onClick={() => openModal({ type: 'accountContribution', amount: due })}>
            {due > 0 ? 'Докинуть свою долю' : 'Пополнить общий счёт'}
          </Button>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<Plus size={16} />} onClick={() => openModal({ type: 'expenseForm' })}>
          Записать расход
        </Button>
        <Button size="sm" variant="secondary" icon={<Calendar size={16} />} onClick={() => openModal({ type: 'paymentForm' })}>
          Запланировать платёж
        </Button>
        <Button size="sm" variant="ghost" onClick={() => openModal({ type: 'personalPurchases' })}>
          Из покупок или выписки
        </Button>
      </div>
      <Accordion className="mt-4">
        <AccordionItem title="Взносы и доли" contentMaxHeight="none">
          <ul className="space-y-2">
            {family?.members.map((member) => {
              const info = account.members.get(member.id);
              return (
                <li key={member.id} className="rounded-control bg-surface-muted px-3 py-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-medium break-all">{member.name}</p>
                    {member.role !== 'child' && <p className="font-medium tabular">{formatSigned(info?.balance ?? 0)}</p>}
                  </div>
                  {member.role === 'child' ? <p className="text-sm text-ink-2">Не участвует в делении</p> : (
                    <p className="text-sm text-ink-2">Внесено {formatCurrency(info?.contributed ?? 0)}, доля {formatCurrency(info?.share ?? 0)}
                      {!!info?.paidPersonally && `, оплачено лично ${formatCurrency(info.paidPersonally)}`}
                    </p>
                  )}
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
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
