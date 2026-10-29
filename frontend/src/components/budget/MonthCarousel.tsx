import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
 * While the frame eases between two heights, each slide is clipped to it by its own rounded shape:
 * the taller card looks like a card that grows or shrinks, not one cut by a straight line
 */
const SLIDE_CLIP = 'max-h-full overflow-hidden rounded-card';

/**
 * Carousel of the main block: on month change the previous month slides out
 * and the new one slides in from the side the user navigated to.
 * Months differ in height, so the frame eases from the old height to the new one over the same time.
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

  const frameRef = useRef<HTMLDivElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLDivElement>(null);

  // Runs before paint: the frame must not show the new height for even one frame
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (!leaving) {
      frame.style.height = '';
      frame.style.transition = '';
      return;
    }
    // A month picked mid-slide continues from the frame's current height, not from the slide's full one.
    // scrollHeight: the slides are clipped to the frame, their full height is the content's
    const from = frame.style.height ? frame.getBoundingClientRect().height : (outRef.current?.scrollHeight ?? 0);
    const to = inRef.current?.scrollHeight ?? from;
    frame.style.transition = 'none';
    frame.style.height = `${from}px`;
    frame.getBoundingClientRect(); // commit the start height before transitioning
    frame.style.transition = 'height var(--dur-carousel) var(--ease-in-out)';
    frame.style.height = `${to}px`;
  }, [leaving]);

  const next = (leaving?.direction ?? direction) > 0;

  return (
    // The outgoing slide sits exactly over the incoming one, so nothing shifts when the animation starts
    <div ref={frameRef} className="relative overflow-hidden">
      {leaving && (
        <div
          ref={outRef}
          key={`out-${leaving.monthKey}`}
          className={`absolute inset-x-0 top-0 ${SLIDE_CLIP} ${next ? 'animate-slide-out-next' : 'animate-slide-out-prev'}`}
          aria-hidden
          inert
        >
          <MonthSlide monthKey={leaving.monthKey} />
        </div>
      )}
      <div ref={inRef} key={shown} className={leaving ? `${SLIDE_CLIP} ${next ? 'animate-slide-in-next' : 'animate-slide-in-prev'}` : ''}>
        <MonthSlide monthKey={shown} />
      </div>
    </div>
  );
}
