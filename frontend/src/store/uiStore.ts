import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ExpenseCategory, Role, Tab, Toast } from '../types';
import { toMonthKey } from '../utils/date';
import { EXIT_MS } from '../utils/motion';

export type ModalState =
  | { type: 'expenseForm'; expenseId?: string; prefill?: { title?: string; amount?: number; category?: ExpenseCategory } }
  | { type: 'expenseDetails'; expenseId: string }
  | { type: 'budgetForm' }
  | { type: 'paymentForm'; paymentId?: string }
  | { type: 'purchaseCheck' }
  | { type: 'invite' }
  | null;

export type Theme = 'light' | 'dark' | 'system';
export type DataStatus = 'loading' | 'ready' | 'error';

interface UIState {
  tab: Tab;
  /** Month the user is viewing. Independent from the date of an expense being edited. */
  monthKey: string;
  /** Direction of the last month change, drives the carousel: 1 — forward, -1 — back */
  monthDirection: 1 | -1;
  modal: ModalState;
  toasts: Toast[];
  theme: Theme;
  /** Demo switch: make every request to the mock server fail */
  simulateErrors: boolean;
  dataStatus: DataStatus;
  /** Invite links created in this tab: the server shows a code only once. Key: `${familyId}:${role}` */
  inviteLinks: Record<string, { url: string; expiresAt: number }>;
  setTab: (tab: Tab) => void;
  setMonthKey: (monthKey: string) => void;
  openModal: (modal: NonNullable<ModalState>) => void;
  closeModal: () => void;
  addToast: (message: string, type?: Toast['type'], action?: Toast['action']) => void;
  removeToast: (id: string) => void;
  setTheme: (theme: Theme) => void;
  setSimulateErrors: (value: boolean) => void;
  setDataStatus: (status: DataStatus) => void;
  rememberInviteLink: (familyId: string, role: Role, link: { url: string; expiresAt: number }) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      tab: 'overview',
      monthKey: toMonthKey(),
      monthDirection: 1,
      modal: null,
      toasts: [],
      theme: 'light',
      simulateErrors: false,
      dataStatus: 'loading',
      inviteLinks: {},

      setTab: (tab) => set({ tab }),
      setMonthKey: (monthKey) =>
        set((state) => (monthKey === state.monthKey ? state : { monthKey, monthDirection: monthKey > state.monthKey ? 1 : -1 })),
      openModal: (modal) => set({ modal }),
      closeModal: () => set({ modal: null }),

      addToast: (message, type = 'success', action) => {
        const id = Math.random().toString(36).slice(2, 8);
        set((state) => ({ toasts: [...state.toasts.slice(-2), { id, message, type, action }] }));
        setTimeout(() => get().removeToast(id), action ? 6000 : 4000);
      },
      removeToast: (id) => {
        if (!get().toasts.some((t) => t.id === id && !t.leaving)) return;
        set((state) => ({ toasts: state.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }));
        setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), EXIT_MS);
      },

      setTheme: (theme) => set({ theme }),
      setSimulateErrors: (simulateErrors) => set({ simulateErrors }),
      setDataStatus: (dataStatus) => set({ dataStatus }),
      rememberInviteLink: (familyId, role, link) =>
        set((state) => ({ inviteLinks: { ...state.inviteLinks, [`${familyId}:${role}`]: link } })),
    }),
    {
      name: 'fb-ui-v2',
      partialize: (s) => ({ theme: s.theme, simulateErrors: s.simulateErrors }),
    }
  )
);
