import { useState } from 'react';
import { CalendarClock, HandCoins, Pencil, Trash2 } from 'lucide-react';
import { deleteExpense } from '../../api/client';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useDataStore } from '../../store/dataStore';
import { resolveAuthorName, useFamilyStore, useIsParent } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { CATEGORIES } from '../../utils/categories';
import { formatCurrency } from '../../utils/currency';
import { formatDateShort, parseISODate } from '../../utils/date';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CategoryIcon } from '../ui/Misc';

/** Operation details. Edit is a regular action, delete is separated and confirmed. Any adult may fix any record. */
export function ExpenseDetailsModal({ expenseId }: { expenseId: string }) {
  const closeModal = useUIStore((s) => s.closeModal);
  const openModal = useUIStore((s) => s.openModal);
  const addToast = useUIStore((s) => s.addToast);
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const isParent = useIsParent();
  const expense = useDataStore((s) => s.expenses.find((e) => e.id === expenseId));
  const remove = useAsyncAction(deleteExpense);
  const [confirming, setConfirming] = useState(false);

  if (!expense) {
    return (
      <Modal title="Операция не найдена" onClose={closeModal}>
        <p className="text-ink-2">Возможно, её уже удалили.</p>
      </Modal>
    );
  }

  const own = expense.authorId === currentUserId;
  // Same rule as the server: an adult changes any expense; a child — only own, and not one bought by an approved request
  const canManage = isParent || (own && !expense.requestId);
  const authorName = resolveAuthorName(family, expense.authorId, expense.authorName);
  const payerId = expense.paidBy ?? expense.authorId;
  const payerName = resolveAuthorName(family, payerId, expense.authorName);
  const created = new Date(expense.createdAt);

  const onDelete = async () => {
    const res = await remove.run(expense.id);
    if (!res.ok) return;
    closeModal();
    addToast(expense.paymentId ? 'Расход удалён, платёж снова в предстоящих' : 'Расход удалён');
  };

  if (confirming) {
    return (
      <ConfirmDialog
        title="Удалить расход?"
        confirmLabel="Удалить"
        pending={remove.pending}
        error={remove.error}
        onCancel={() => setConfirming(false)}
        onConfirm={onDelete}
      >
        <p>
          «<span className="text-ink font-medium break-words">{expense.title}</span>» на {formatCurrency(expense.amount)} исчезнет у всех
          участников семьи. Это действие нельзя отменить.
        </p>
        {expense.paymentId && <p>Связанный обязательный платёж вернётся в предстоящие, и сумма снова будет зарезервирована.</p>}
      </ConfirmDialog>
    );
  }

  return (
    <Modal
      title={expense.title}
      onClose={closeModal}
      footer={
        canManage ? (
          <div className="flex items-center gap-3">
            <Button variant="dangerSoft" size="lg" className="flex-1" icon={<Trash2 size={17} />} onClick={() => setConfirming(true)}>
              Удалить
            </Button>
            <Button
              className="flex-1"
              size="lg"
              icon={<Pencil size={17} />}
              onClick={() => openModal({ type: 'expenseForm', expenseId: expense.id })}
            >
              Изменить
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex items-center gap-3 mb-4">
        <CategoryIcon category={expense.category} />
        <span className="text-[28px] font-bold tabular text-ink">−{formatCurrency(expense.amount)}</span>
      </div>
      <dl className="divide-y divide-line text-[15px]">
        <DetailRow label="Категория" value={CATEGORIES[expense.category].label} />
        <DetailRow label="Дата покупки" value={`${formatDateShort(expense.date)} ${parseISODate(expense.date).getFullYear()}`} />
        <DetailRow label="Кто добавил" value={own ? `${authorName} (вы)` : authorName} />
        {payerId !== expense.authorId && (
          <DetailRow label="Кто платил" value={payerId === currentUserId ? `${payerName} (вы)` : payerName} />
        )}
        <DetailRow
          label="Запись создана"
          value={created.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
        />
      </dl>
      {expense.paymentId && (
        <p className="mt-4 flex gap-2 text-sm text-ink-2 bg-surface-muted rounded-xl p-3">
          <CalendarClock size={17} className="shrink-0 text-ink-3" aria-hidden />
          Создано из обязательного платежа. Он учтён в расходах и больше не резервируется.
        </p>
      )}
      {expense.requestId && (
        <p className="mt-4 flex gap-2 text-sm text-ink-2 bg-surface-muted rounded-xl p-3">
          <HandCoins size={17} className="shrink-0 text-ink-3" aria-hidden />
          Куплено по одобренному запросу. Карманные деньги эта покупка не уменьшает.
        </p>
      )}
      {!canManage && (
        <p className="mt-4 text-sm text-ink-3">
          {expense.requestId ? 'Изменить покупку по запросу может взрослый участник семьи.' : `Изменить запись может ${authorName} или взрослый участник семьи.`}
        </p>
      )}
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-ink text-right break-words min-w-0">{value}</dd>
    </div>
  );
}
