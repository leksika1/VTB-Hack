import { PaymentList } from '../components/payments/PaymentList';
import { Disclosure } from '../components/ui/Disclosure';
import { MonthSwitcher } from '../components/ui/Misc';
import { useMonthSummary } from '../hooks/useMonthSummary';
import { OtherBankPurchases, PersonalCardPurchases } from '../components/account/PersonalPurchases';
import { Button } from '../components/ui/Button';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { Calendar, Plus } from '../components/ui/icons';
import { useUIStore } from '../store/uiStore';

export function RecordsPage() {
  const { upcomingPayments } = useMonthSummary();
  const openModal = useUIStore((s) => s.openModal);
  const monthKey = useUIStore((s) => s.monthKey);

  return (
    <>
      <PageHeader title="Записи"><MonthSwitcher /></PageHeader>
      <div className="mx-auto max-w-4xl space-y-5">
        <PersonalCardPurchases key={monthKey} />
        <Card className="p-5">
          <SectionHeader title="Записать вручную" />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button icon={<Plus size={18} />} className="min-w-0 max-sm:px-2!"
              onClick={() => openModal({ type: 'expenseForm' })}>Добавить покупку</Button>
            <Button variant="secondary" icon={<Calendar size={18} />} className="min-w-0 max-sm:!px-2"
              onClick={() => openModal({ type: 'paymentForm' })}>Добавить платёжку</Button>
          </div>
        </Card>
        <OtherBankPurchases />
        {upcomingPayments.length > 0 && (
          <Card className="p-2">
            <Disclosure title={`Записать оплату (${upcomingPayments.length})`}>
              <div className="pt-2"><PaymentList payments={upcomingPayments} /></div>
            </Disclosure>
          </Card>
        )}
      </div>
    </>
  );
}
