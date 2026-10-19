import { Modal } from '../ui/Modal';
import { useUIStore } from '../../store/uiStore';
import { useExpensesStore } from '../../store/expensesStore';
import { AlertTriangle } from 'lucide-react';

export function DeleteConfirmModal() {
  const activeModal = useUIStore((s) => s.activeModal);
  const deletingExpenseId = useUIStore((s) => s.deletingExpenseId);
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);
  const deleteExpense = useExpensesStore((s) => s.deleteExpense);
  const expenses = useExpensesStore((s) => s.expenses);

  const expense = deletingExpenseId ? expenses.find((e) => e.id === deletingExpenseId) : null;

  const handleDelete = () => {
    if (!deletingExpenseId) return;
    deleteExpense(deletingExpenseId);
    addToast('Расход удалён');
    closeModal();
  };

  return (
    <Modal open={activeModal === 'deleteConfirm'} onClose={closeModal} title="Удалить расход?">
      <div className="space-y-5">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--color-danger-dim)]">
          <AlertTriangle size={20} className="text-[var(--color-danger)] shrink-0 mt-0.5" />
          <div className="text-sm text-[var(--color-text-primary)]">
            <p>Вы уверены, что хотите удалить расход{expense ? ` «${expense.title}»` : ''}?</p>
            <p className="text-[var(--color-text-muted)] mt-1">Это действие нельзя отменить.</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={closeModal}
            className="flex-1 py-3 rounded-[var(--radius-button)] bg-[var(--color-bg-card)]
              border border-[var(--color-border)] text-[var(--color-text-secondary)]
              font-semibold text-sm hover:text-[var(--color-text-primary)] transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleDelete}
            className="flex-1 py-3 rounded-[var(--radius-button)] bg-[var(--color-danger)] text-white
              font-bold text-sm hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Удалить
          </button>
        </div>
      </div>
    </Modal>
  );
}
