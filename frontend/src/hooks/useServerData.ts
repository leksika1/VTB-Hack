import { useEffect, useSyncExternalStore } from 'react';
import {
  errorMessage,
  getAccountSummary,
  getAnalytics,
  getAutopayCatalog,
  getCalendar,
  getPaymentDetails,
  subscribeToDataChanges,
} from '../api/client';
import { useFamilyStore } from '../store/familyStore';
import type { AccountSummary, Analytics, AutopayCatalog, CalendarData, Payment } from '../types';

export interface ServerDataState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface Snapshot<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
}

interface CacheEntry<T> {
  fetcher: () => Promise<T>;
  snapshot: Snapshot<T>;
  pending: Promise<void> | null;
  listeners: Set<() => void>;
}

const cache = new Map<string, CacheEntry<unknown>>();

function entryFor<T>(key: string, fetcher: () => Promise<T>, enabled: boolean): CacheEntry<T> {
  let entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    entry = {
      fetcher,
      snapshot: { data: undefined, loading: enabled, error: null },
      pending: null,
      listeners: new Set(),
    };
    cache.set(key, entry as CacheEntry<unknown>);
  } else {
    entry.fetcher = fetcher;
  }
  return entry;
}

function publish<T>(entry: CacheEntry<T>, snapshot: Snapshot<T>) {
  entry.snapshot = snapshot;
  for (const listener of entry.listeners) listener();
}

function load<T>(entry: CacheEntry<T>, force = false): Promise<void> {
  if (entry.pending) return entry.pending;
  if (!force && entry.snapshot.data !== undefined) return Promise.resolve();
  publish(entry, { ...entry.snapshot, loading: true, error: null });
  entry.pending = entry.fetcher().then(
    (data) => publish(entry, { data, loading: false, error: null }),
    (error: unknown) => publish(entry, { ...entry.snapshot, loading: false, error: errorMessage(error) }),
  ).finally(() => {
    entry.pending = null;
  });
  return entry.pending;
}

function useServerResource<T>(key: string, fetcher: () => Promise<T>, enabled: boolean): ServerDataState<T> {
  const entry = entryFor(key, fetcher, enabled);

  useEffect(() => {
    if (!enabled) return;
    void load(entry);
    return subscribeToDataChanges(() => void load(entry, true));
  }, [enabled, entry]);

  const snapshot = useSyncExternalStore(
    (listener) => {
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    () => entry.snapshot,
    () => entry.snapshot,
  );

  return { ...snapshot, refetch: () => load(entry, true) };
}

function useScope(): string | null {
  return useFamilyStore((state) => state.family?.id ?? null);
}

export function useAccountSummary(month: string): ServerDataState<AccountSummary> {
  const scope = useScope();
  return useServerResource(`account:${scope ?? 'none'}:${month}`, () => getAccountSummary(month), !!scope && !!month);
}

export function useAnalytics(month: string, months = 6): ServerDataState<Analytics> {
  const scope = useScope();
  return useServerResource(
    `analytics:${scope ?? 'none'}:${month}:${months}`,
    () => getAnalytics(month, months),
    !!scope && !!month,
  );
}

export function useCalendar(month: string): ServerDataState<CalendarData> {
  const scope = useScope();
  return useServerResource(`calendar:${scope ?? 'none'}:${month}`, () => getCalendar(month), !!scope && !!month);
}

export function useAutopayCatalog(): ServerDataState<AutopayCatalog> {
  const scope = useScope();
  return useServerResource(`autopay:${scope ?? 'none'}`, getAutopayCatalog, !!scope);
}

export function usePaymentDetails(id: string | null | undefined): ServerDataState<Payment> {
  const scope = useScope();
  const paymentId = id ?? '';
  return useServerResource(
    `payment:${scope ?? 'none'}:${paymentId || 'none'}`,
    () => getPaymentDetails(paymentId),
    !!scope && !!paymentId,
  );
}
