import { useEffect, useMemo, useState } from 'react';
import { T } from '@admiral-ds/react-ui';
import {
  errorMessage,
  listNotifications,
  markNotificationsRead,
  subscribeToDataChanges,
} from '../../api/client';
import { useAccountSummary } from '../../hooks/useServerData';
import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import type { AppNotification } from '../../types';
import { toMonthKey } from '../../utils/date';
import { Button } from '../ui/Button';
import { Bell, Refresh } from '../ui/icons';
import { Modal } from '../ui/Modal';

export function NotificationsModal() {
  const closeModal = useUIStore((state) => state.closeModal);
  const openModal = useUIStore((state) => state.openModal);
  const setTab = useUIStore((state) => state.setTab);
  const currentUserId = useFamilyStore((state) => state.currentUserId);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [initialUnread, setInitialUnread] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const debtMonth = useMemo(() => {
    const value = notifications.find((item) => item.kind === 'debt_reminder')?.data.month;
    return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) ? value : toMonthKey();
  }, [notifications]);
  const account = useAccountSummary(debtMonth);
  const ownSuggestion = account.data?.members.find((member) => member.memberId === currentUserId)?.topUpSuggestion;

  useEffect(() => {
    let active = true;

    const load = async (initial: boolean) => {
      if (initial) setLoading(true);
      try {
        const items = await listNotifications();
        if (!active) return false;
        setNotifications(items);
        setInitialUnread((current) => current ?? new Set(items.filter((item) => item.readAt === null).map((item) => item.id)));
        setLoadError(null);
        return true;
      } catch (error) {
        if (active) setLoadError(errorMessage(error));
        return false;
      } finally {
        if (active && initial) setLoading(false);
      }
    };

    void (async () => {
      if (await load(true)) {
        try {
          await markNotificationsRead();
        } catch (error) {
          if (active) setLoadError(errorMessage(error));
        }
      }
    })();
    const unsubscribe = subscribeToDataChanges(() => void load(false));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [reload]);

  const act = (notification: AppNotification) => {
    if (notification.kind === 'debt_reminder') {
      const due = numberData(notification, 'due');
      const notificationMonth = stringData(notification, 'month');
      const amount = notificationMonth === debtMonth && ownSuggestion !== undefined ? ownSuggestion : due;
      openModal({ type: 'accountContribution', ...(amount > 0 ? { amount } : {}) });
      return;
    }
    if (PAYMENT_KINDS.has(notification.kind)) {
      const paymentId = stringData(notification, 'paymentId');
      if (paymentId) openModal({ type: 'paymentDetails', paymentId });
      return;
    }
    if (notification.kind === 'member_join_request') {
      closeModal();
      setTab('family');
    }
  };

  return (
    <Modal title="Уведомления" onClose={closeModal} size="lg">
      {loading && (
        <div className="space-y-3 py-2" aria-label="Загрузка уведомлений">
          <div className="h-20 animate-pulse rounded-control bg-surface-muted" />
          <div className="h-20 animate-pulse rounded-control bg-surface-muted" />
        </div>
      )}

      {!loading && loadError && notifications.length === 0 && (
        <div role="alert" className="py-8 text-center">
          <p className="font-semibold text-ink">Не удалось загрузить уведомления</p>
          <p className="mt-1 text-sm text-ink-2">{loadError}</p>
          <Button className="mt-4" variant="secondary" size="sm" icon={<Refresh size={16} />}
            onClick={() => setReload((value) => value + 1)}>Повторить</Button>
        </div>
      )}

      {!loading && !loadError && notifications.length === 0 && (
        <div className="flex flex-col items-center px-4 py-10 text-center">
          <span className="mb-3 grid size-12 place-items-center rounded-full bg-accent-soft text-accent-ink" aria-hidden>
            <Bell size={22} />
          </span>
          <T font="Subtitle/Subtitle 2">Новых уведомлений нет</T>
        </div>
      )}

      {notifications.length > 0 && (
        <ul className="divide-y divide-line">
          {notifications.map((notification) => {
            const unread = Boolean(initialUnread?.has(notification.id) || notification.readAt === null);
            const action = notificationAction(notification);
            return (
              <li key={notification.id} className={`rounded-control px-3 py-4 ${unread ? 'bg-accent-soft' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-1 size-2 shrink-0 rounded-full ${unread ? 'bg-accent' : 'bg-transparent'}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="font-semibold text-ink wrap-anywhere">{notification.title}</p>
                      <time className="shrink-0 text-xs text-ink-3" dateTime={new Date(notification.createdAt).toISOString()}>
                        {formatNotificationTime(notification.createdAt)}
                      </time>
                    </div>
                    <p className="mt-1 text-sm text-ink-2 wrap-anywhere">{notification.body}</p>
                    {action && (
                      <Button className="mt-3" size="sm" variant="secondary" onClick={() => act(notification)}>
                        {action}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {loadError && notifications.length > 0 && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-danger">
          <span>Не удалось обновить уведомления.</span>
          <Button size="sm" variant="ghost" onClick={() => setReload((value) => value + 1)}>Повторить</Button>
        </div>
      )}
    </Modal>
  );
}

const PAYMENT_KINDS = new Set(['autopay_limit', 'autopay_shortage', 'payment_due']);

function notificationAction(notification: AppNotification): string | null {
  if (notification.kind === 'debt_reminder') return 'Пополнить';
  if (PAYMENT_KINDS.has(notification.kind) && stringData(notification, 'paymentId')) return 'Открыть платёж';
  if (notification.kind === 'member_join_request') return 'Открыть';
  return null;
}

function stringData(notification: AppNotification, key: string): string | null {
  const value = notification.data[key];
  return typeof value === 'string' && value ? value : null;
}

function numberData(notification: AppNotification, key: string): number {
  const value = notification.data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatNotificationTime(createdAt: number): string {
  const elapsed = Math.max(0, Date.now() - createdAt);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const date = new Date(createdAt);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}
