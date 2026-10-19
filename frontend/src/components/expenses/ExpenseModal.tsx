import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { useUIStore } from '../../store/uiStore';
import { useExpensesStore } from '../../store/expensesStore';
import { useFamilyStore } from '../../store/familyStore';
import { ALL_CATEGORIES, CATEGORIES } from '../../utils/categories';
import { todayISO } from '../../utils/date';
import type { ExpenseCategory } from '../../types';

interface ExpenseModalProps {
  monthKey?: string;
}

export function ExpenseModal(_props: ExpenseModalProps) {
  const activeModal = useUIStore((s) => s.activeModal);
  const editingExpenseId = useUIStore((s) => s.editingExpenseId);
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);

  const addExpense = useExpensesStore((s) => s.addExpense);
  const updateExpense = useExpensesStore((s) => s.updateExpense);
  const expenses = useExpensesStore((s) => s.expenses);

  const family = useFamilyStore((s) => s.family);
  const getCurrentUser = useFamilyStore((s) => s.getCurrentUser);

  const isEdit = activeModal === 'editExpense' && !!editingExpenseId;
  const editingExpense = isEdit ? expenses.find((e) => e.id === editingExpenseId) : null;

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [date, setDate] = useState(todayISO());

  useEffect(() => {
    if (editingExpense) {
      setTitle(editingExpense.title);
      setAmount(String(editingExpense.amount));
      setCategory(editingExpense.category);
      setDate(editingExpense.date);
    } else {
      setTitle('');
      setAmount('');
      setCategory('food');
      setDate(todayISO());
    }
  }, [editingExpense, activeModal]);

  const amountNum = Number(amount) || 0;
  const canSave = title.trim().length > 0 && amountNum > 0;

  const handleSave = () => {
    if (!canSave || !family) return;
    const user = getCurrentUser();
    if (!user) return;

    if (isEdit && editingExpenseId) {
      updateExpense(editingExpenseId, {
        title: title.trim(),
        amount: amountNum,
        category,
        date,
      });
      addToast('Расход обновлён');
    } else {
      addExpense({
        familyId: family.id,
        title: title.trim(),
        amount: amountNum,
        category,
        date,
        authorId: user.id,
        authorName: user.name,
      });
      addToast('Расход добавлен');
    }
    closeModal();
  };

  const open = activeModal === 'addExpense' || activeModal === 'editExpense';

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title={isEdit ? 'Редактировать расход' : 'Добавить расход'}
    >
      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
            Название
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Продукты в Пятёрочке"
            className="w-full px-4 py-3 rounded-[var(--radius-input)] bg-[var(--color-bg-input)]
              border border-[var(--color-border)] text-[var(--color-text-primary)]
              placeholder:text-[var(--color-text-muted)] text-sm
              focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
            Сумма
          </label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1500"
              min={1}
              className="w-full px-4 py-3 pr-10 rounded-[var(--radius-input)] bg-[var(--color-bg-input)]
                border border-[var(--color-border)] text-[var(--color-text-primary)]
                placeholder:text-[var(--color-text-muted)] text-lg font-bold
                focus:outline-none focus:border-[var(--color-border-focus)]
                transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)]">₽</span>
          </div>
          {amount && amountNum <= 0 && (
            <p className="text-xs text-[var(--color-danger)] mt-1.5">Сумма должна быть больше нуля</p>
          )}
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
            Категория
          </label>
          <div className="grid grid-cols-5 gap-2">
            {ALL_CATEGORIES.map((key) => {
              const cfg = CATEGORIES[key];
              const Icon = cfg.icon;
              const active = category === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`group relative flex flex-col items-center gap-1.5 p-2.5 rounded-xl border cursor-pointer select-none
                    transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
                    active:scale-95 ${active ? 'scale-[1.04]' : 'scale-100 hover:scale-[1.02]'}`}
                  style={{
                    borderColor: active ? cfg.color : 'var(--color-border)',
                    backgroundColor: active ? `${cfg.color}1c` : 'var(--color-bg-input)',
                    boxShadow: active ? `0 0 16px ${cfg.color}35` : '0 0 0px transparent',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  <Icon
                    size={18}
                    className="transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{
                      color: active ? cfg.color : 'var(--color-text-muted)',
                      transform: active ? 'scale(1.15)' : 'scale(1)',
                      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  />
                  <span
                    className="text-[10px] font-semibold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{
                      color: active ? cfg.color : 'var(--color-text-muted)',
                      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  >
                    {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
            Дата
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-4 py-3 rounded-[var(--radius-input)] bg-[var(--color-bg-input)]
              border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm
              focus:outline-none focus:border-[var(--color-border-focus)] transition-colors
              [color-scheme:dark]"
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full py-3.5 rounded-[var(--radius-button)] bg-[var(--color-lime)] text-[var(--color-text-inverse)]
            font-bold text-sm uppercase tracking-wide
            hover:brightness-110 active:scale-[0.98]
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-200
            shadow-[0_0_20px_var(--color-lime-glow)]"
        >
          {isEdit ? 'Сохранить изменения' : 'Добавить'}
        </button>
      </div>
    </Modal>
  );
}
