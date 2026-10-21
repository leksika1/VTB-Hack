import { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useMonthSummary } from '../../hooks/useMonthSummary';
import { useUIStore } from '../../store/uiStore';
import { formatMonthLower } from '../../utils/date';
import { CAROUSEL_MS } from '../../utils/motion';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/Feedback';
import { FreeAmountCard } from './FreeAmountCard';

/** The main block of one month: free amount, or a prompt to set the budget */
function MonthSlide({ monthKey }: { monthKey: string }) {
  const openModal = useUIStore((s) => s.openModal);
  const summary = useMonthSummary(monthKey);

  if (summary.hasBudget) return <FreeAmountCard summary={summary} monthKey={monthKey} />;
  return (
    <Card className="p-2">
      <EmptyState
        icon={<ClipboardList size={22} />}
        title={`Бюджет на ${formatMonthLower(monthKey)} не задан`}
        description="Задайте общий план и лимиты по категориям — тогда приложение покажет, сколько свободно с учётом будущих платежей."
        action={<Button onClick={() => openModal({ type: 'budgetForm' })}>Задать бюджет</Button>}
      />
    </Card>
  );
}

/**
 * Carousel of the main block: on month change the previous month slides out
 * and the new one slides in from the side the user navigated to.
 */
export function MonthCarousel() {
  const monthKey = useUIStore((s) => s.monthKey);
  const direction = useUIStore((s) => s.monthDirection);
  const [shown, setShown] = useState(monthKey);
  const [leaving, setLeaving] = useState<{ monthKey: string; direction: 1 | -1 } | null>(null);

  // Adjust state during render when the viewed month changes
  if (monthKey !== shown) {
    setLeaving({ monthKey: shown, direction });
    setShown(monthKey);
  }

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), CAROUSEL_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  const next = (leaving?.direction ?? direction) > 0;

  return (
    // The outgoing slide sits exactly over the incoming one, so nothing shifts when the animation starts
    <div className="relative overflow-hidden">
      {leaving && (
        <div
          key={`out-${leaving.monthKey}`}
          className={`absolute inset-x-0 top-0 ${next ? 'animate-slide-out-next' : 'animate-slide-out-prev'}`}
          aria-hidden
          inert
        >
          <MonthSlide monthKey={leaving.monthKey} />
        </div>
      )}
      <div key={shown} className={leaving ? (next ? 'animate-slide-in-next' : 'animate-slide-in-prev') : ''}>
        <MonthSlide monthKey={shown} />
      </div>
    </div>
  );
}
