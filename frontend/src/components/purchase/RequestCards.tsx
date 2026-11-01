import { Check, HandCoins, X } from 'lucide-react';
import type { PurchaseRequest } from '../../types';
import { cancelPurchaseRequest, decidePurchaseRequest } from '../../api/client';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useDataStore } from '../../store/dataStore';
import { resolveAuthorName, useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { CATEGORIES } from '../../utils/categories';
import { formatBalance, formatCurrency } from '../../utils/currency';
import { formatDateShort, toISODate } from '../../utils/date';
import { Card, SectionHeader } from '../ui/Card';
import { Badge } from '../ui/Misc';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/Feedback';
import { VERDICT } from './verdict';

/** Adults: pending requests with the server's check of how the purchase fits the month. Hidden when there are none */
export function PendingRequestsCard() {
  // Select the stored array and filter here: a selector returning a new array would re-render forever
  const requests = useDataStore((s) => s.purchaseRequests);
  const pending = requests.filter((r) => r.status === 'pending');
  if (pending.length === 0) return null;

  return (
    <Card tone="accent" className="p-5">
      <SectionHeader title="Просят купить" subtitle="При одобрении покупка сразу запишется в расходы семьи" />
      <ul className="divide-y divide-line">
        {pending.map((r) => (
          <PendingRequestRow key={r.id} request={r} />
        ))}
      </ul>
    </Card>
  );
}

function PendingRequestRow({ request }: { request: PurchaseRequest }) {
  const addToast = useUIStore((s) => s.addToast);
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const approve = useAsyncAction(decidePurchaseRequest);
  const reject = useAsyncAction(decidePurchaseRequest);
  const busy = approve.pending || reject.pending;
  const error = approve.error ?? reject.error;
  const own = request.authorId === currentUserId;
  const author = resolveAuthorName(family, request.authorId);
  const check = request.check;
  const verdict = check ? VERDICT[check.verdict] : null;
  const VerdictIcon = verdict?.icon;

  const decide = async (decision: 'approve' | 'reject') => {
    const action = decision === 'approve' ? approve : reject;
    const res = await action.run(request.id, decision);
    if (!res.ok) return;
    addToast(
      decision === 'approve' ? `«${request.title}» одобрено и записано в расходы` : `Запрос «${request.title}» отклонён`,
      decision === 'approve' ? 'success' : 'info'
    );
  };

  return (
    <li className="py-3 first:pt-1 last:pb-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink break-words">{request.title}</p>
          <p className="text-sm text-brand-2">
            {formatDateShort(toISODate(new Date(request.createdAt)))}, {own ? 'Ваш запрос' : author}, {CATEGORIES[request.category].label}
          </p>
          {request.comment && <p className="text-sm text-ink-2 mt-1 break-words">Комментарий: {request.comment}</p>}
        </div>
        <span className="font-semibold tabular text-ink whitespace-nowrap">{formatCurrency(request.amount)}</span>
      </div>
      {verdict && VerdictIcon && check && (
        <p className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${verdict.tone}`}>
          <VerdictIcon size={16} className="shrink-0 mt-0.5" aria-hidden />
          <span>
            <span className="font-semibold">{verdict.title}.</span>{' '}
            <span className="text-ink">После покупки свободно по плану {formatBalance(check.freeAfter)}</span>
          </span>
        </p>
      )}
      {own ? (
        <p className="text-sm text-ink-3 mt-2">Решение принимает другой взрослый участник семьи.</p>
      ) : (
        <div className="flex items-center gap-2 mt-3">
          <Button size="sm" icon={<Check size={15} />} loading={approve.pending} disabled={busy} onClick={() => decide('approve')}>
            Одобрить
          </Button>
          <Button size="sm" variant="dangerGhost" icon={<X size={15} />} loading={reject.pending} disabled={busy} onClick={() => decide('reject')}>
            Отклонить
          </Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger mt-2">{error}</p>}
    </li>
  );
}

const STATUS: Record<PurchaseRequest['status'], { tone: 'accent' | 'success' | 'danger' | 'neutral'; label: string }> = {
  pending: { tone: 'accent', label: 'Ждёт ответа' },
  approved: { tone: 'success', label: 'Одобрено' },
  rejected: { tone: 'danger', label: 'Отказано' },
  cancelled: { tone: 'neutral', label: 'Отменён' },
};

const DECIDED_LIMIT = 5;

/** A child's own requests: waiting ones first, then a few recent answers */
export function MyRequestsCard() {
  const openModal = useUIStore((s) => s.openModal);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const requests = useDataStore((s) => s.purchaseRequests);
  const mine = requests.filter((r) => r.authorId === currentUserId);
  const pending = mine.filter((r) => r.status === 'pending');
  const decided = mine.filter((r) => r.status === 'approved' || r.status === 'rejected').slice(0, DECIDED_LIMIT);
  const shown = [...pending, ...decided];

  return (
    <Card className="p-5">
      <SectionHeader
        title="Мои запросы"
        action={
          <Button size="sm" variant="secondary" icon={<HandCoins size={16} />} onClick={() => openModal({ type: 'purchaseRequestForm' })}>
            Попросить
          </Button>
        }
      />
      {shown.length > 0 ? (
        <ul className="divide-y divide-line">
          {shown.map((r) => (
            <MyRequestRow key={r.id} request={r} />
          ))}
        </ul>
      ) : (
        <EmptyState
          compact
          icon={<HandCoins size={22} />}
          title="Запросов пока нет"
          description="Хотите что-то дороже карманных денег? Попросите взрослых — они увидят запрос и ответят."
        />
      )}
    </Card>
  );
}

function MyRequestRow({ request }: { request: PurchaseRequest }) {
  const addToast = useUIStore((s) => s.addToast);
  const cancel = useAsyncAction(cancelPurchaseRequest);
  const status = STATUS[request.status];

  return (
    <li className="py-3 first:pt-1 last:pb-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink break-words">{request.title}</p>
          <p className="text-sm text-ink-2 tabular">{formatCurrency(request.amount)}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      {request.decisionComment && <p className="text-sm text-ink-2 mt-1 break-words">Ответ: «{request.decisionComment}»</p>}
      {request.status === 'pending' && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 -ml-3.5"
          loading={cancel.pending}
          onClick={async () => {
            const res = await cancel.run(request.id);
            if (res.ok) addToast('Запрос отменён', 'info');
          }}
        >
          Отменить запрос
        </Button>
      )}
      {cancel.error && <p role="alert" className="text-sm text-danger mt-1">{cancel.error}</p>}
    </li>
  );
}
