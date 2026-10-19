import { create } from 'zustand';
import type { Toast } from '../types';

type ModalType =
  | 'budgetConfig'
  | 'addExpense'
  | 'editExpense'
  | 'deleteConfirm'
  | 'invite'
  | 'createFamily'
  | 'joinFamily'
  | 'familySettings'
  | null;

interface UIState {
  activeModal: ModalType;
  editingExpenseId: string | null;
  deletingExpenseId: string | null;
  toasts: Toast[];
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  setEditingExpense: (id: string) => void;
  setDeletingExpense: (id: string) => void;
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  activeModal: null,
  editingExpenseId: null,
  deletingExpenseId: null,
  toasts: [],

  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null, editingExpenseId: null, deletingExpenseId: null }),

  setEditingExpense: (id) => set({ editingExpenseId: id, activeModal: 'editExpense' }),
  setDeletingExpense: (id) => set({ deletingExpenseId: id, activeModal: 'deleteConfirm' }),

  addToast: (message, type = 'success') => {
    const id = Math.random().toString(36).slice(2, 8);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 3500);
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
