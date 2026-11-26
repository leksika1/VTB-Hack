import { PaymentList } from '../components/payments/PaymentList';
import { Disclosure } from '../components/ui/Disclosure';
import { MonthSwitcher } from '../components/ui/Misc';
import { useMonthSummary } from '../hooks/useMonthSummary';
import { PersonalPurchases } from '../components/account/PersonalPurchases';
import { Button } from '../components/ui/Button';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { Calendar, Plus } from '../components/ui/icons';
import { useDataStore } from '../store/dataStore';
import { useFamilyStore, useIsParent } from '../store/familyStore';
import { useUIStore } from '../store/uiStore';

export function RecordsPage() {
  const isParent = useIsParent();
  const memberId = useFamilyStore((s) => s.currentUserId);
  const hasAllowance = useDataStore((s) => s.allowances.some((item) => item.memberId === memberId));
  const { upcomingPayments } = useMonthSummary();
  const openModal = useUIStore((s) => s.openModal);

  return (
    <>
      <PageHeader title="Записи"><MonthSwitcher /></PageHeader>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5 min-w-0">
          <Card className="p-5">
            <SectionHeader title="Добавить вручную" />
            <div className={`gap-2 sm:flex sm:flex-wrap ${isParent ? 'grid grid-cols-2' : 'flex'}`}>
              {(isParent || hasAllowance) && (
                <Button icon={<Plus size={18} />} aria-label="Записать покупку" className="min-w-0 max-sm:!px-2" onClick={() => openModal({ type: 'expenseForm' })}>
                  <span className="sm:hidden">Покупка</span><span className="hidden sm:inline">Записать покупку</span>
                </Button>
              )}
              {isParent && (
                <Button variant="secondary" icon={<Calendar size={18} />} aria-label="Запланировать платёж" className="min-w-0 max-sm:!px-2" onClick={() => openModal({ type: 'paymentForm' })}>
                  <span className="sm:hidden">Платёж</span><span className="hidden sm:inline">Запланировать платёж</span>
                </Button>
              )}
              {!isParent && !hasAllowance && <p className="text-ink-2">Записывать покупки можно после назначения карманных денег.</p>}
            </div>
          </Card>
          {isParent && upcomingPayments.length > 0 && (
            <Card className="p-2">
              <Disclosure title={`Записать оплату (${upcomingPayments.length})`}>
                <div className="pt-2"><PaymentList payments={upcomingPayments} /></div>
              </Disclosure>
            </Card>
          )}
        </div>
        {isParent && <PersonalPurchases />}
      </div>
    </>
  );
}
