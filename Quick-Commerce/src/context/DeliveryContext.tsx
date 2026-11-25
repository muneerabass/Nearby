import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import * as deliveryService from '../services/deliveryService';
import { ApiError } from '../services/apiClient';
import { getErrorMessage } from '../utils/errors';
import { Order } from '../types';

const POLL_INTERVAL_MS = 20_000;

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** Server error code, e.g. invalid_delivery_code or delivery_code_locked. */
  code?: string;
}

interface DeliveryContextValue {
  pending: Order[];
  active: Order[];
  history: Order[];
  /** A rider may hold only one active delivery at a time. */
  hasActiveOrder: boolean;
  isHydrated: boolean;
  isRefreshing: boolean;
  /** Set while the latest refresh is failing; lists keep their last good data. */
  error: string | null;
  lastUpdated: Date | null;
  refreshAll: () => Promise<boolean>;
  /** True while an accept/complete for this order is in flight. */
  isBusy: (orderId: string) => boolean;
  accept: (orderId: string) => Promise<ActionResult>;
  complete: (orderId: string, deliveryCode: string) => Promise<ActionResult>;
  reject: (orderId: string, reason: string) => Promise<ActionResult>;
  pickup: (orderId: string) => Promise<ActionResult>;
  outForDelivery: (orderId: string) => Promise<ActionResult>;
  isOnline: boolean;
  lastSeenAt: string | null;
  setOnline: (online: boolean) => Promise<ActionResult>;
}

const DeliveryContext = createContext<DeliveryContextValue | undefined>(undefined);

export function DeliveryProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Order[]>([]);
  const [active, setActive] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const busyRef = useRef<Set<string>>(new Set());
  const refreshInFlight = useRef<Promise<boolean> | null>(null);

  // Each list is updated independently and only on success. A failed call never
  // blanks the screen — that used to hide a rider's active delivery and unlock Accept.
  const refreshAll = useCallback(async (): Promise<boolean> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const request = (async () => {
      setIsRefreshing(true);
      const results = await Promise.allSettled([
        deliveryService.getAvailability(),
        deliveryService.listPendingOrders(),
        deliveryService.listMyOrders('accepted'),
        deliveryService.listMyOrders('completed'),
      ]);
      const [availabilityResult, pendingResult, activeResult, historyResult] = results;
      if (availabilityResult.status === 'fulfilled') { setIsOnline(availabilityResult.value.online); setLastSeenAt(availabilityResult.value.last_seen_at ?? null); }
      if (pendingResult.status === 'fulfilled') setPending(pendingResult.value);
      if (activeResult.status === 'fulfilled') setActive(activeResult.value);
      if (historyResult.status === 'fulfilled') setHistory(historyResult.value);
      const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failure) {
        setError(getErrorMessage(failure.reason, 'Could not refresh orders.'));
      } else {
        setError(null);
        setLastUpdated(new Date());
      }
      setIsHydrated(true);
      setIsRefreshing(false);
      return !failure;
    })();
    refreshInFlight.current = request;
    try {
      return await request;
    } finally {
      refreshInFlight.current = null;
    }
  }, []);

  const setOnline = useCallback(async (online: boolean): Promise<ActionResult> => {
    try { const value = await deliveryService.setAvailability(online); setIsOnline(value.online); setLastSeenAt(value.last_seen_at ?? null); await refreshAll(); return { ok: true }; }
    catch (e) { return { ok: false, message: getErrorMessage(e, 'Could not update availability.') }; }
  }, [refreshAll]);

  // Poll while the app is in the foreground; catch up immediately on return.
  useEffect(() => {
    void refreshAll();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let failures = 0;
    const schedule = (delay: number) => {
      if (stopped || timer) return;
      timer = setTimeout(async () => {
        timer = null;
        const ok = await refreshAll();
        failures = ok ? 0 : Math.min(failures + 1, 2);
        schedule(POLL_INTERVAL_MS * 2 ** failures);
      }, delay);
    };
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      stopped = true;
    };
    if (AppState.currentState === 'active') schedule(POLL_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        stopped = false;
        failures = 0;
        void refreshAll();
        schedule(POLL_INTERVAL_MS);
      } else {
        stop();
      }
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, [refreshAll]);

  const withBusy = useCallback(
    async (orderId: string, action: () => Promise<ActionResult>): Promise<ActionResult> => {
      if (busyRef.current.has(orderId)) return { ok: false, message: 'Already working on this order…' };
      busyRef.current.add(orderId);
      setBusy(new Set(busyRef.current));
      try {
        return await action();
      } finally {
        busyRef.current.delete(orderId);
        setBusy(new Set(busyRef.current));
      }
    },
    [],
  );

  const accept = useCallback(
    (orderId: string) =>
      withBusy(orderId, async () => {
        try {
          await deliveryService.acceptOrder(orderId);
          await refreshAll();
          return { ok: true };
        } catch (e) {
          // Always re-sync: a 409 (taken, cancelled, or rider busy) means our lists were stale.
          await refreshAll();
          return { ok: false, message: getErrorMessage(e, 'Could not accept this order.'), code: e instanceof ApiError ? e.code : undefined };
        }
      }),
    [refreshAll, withBusy],
  );

  const complete = useCallback(
    (orderId: string, deliveryCode: string) =>
      withBusy(orderId, async () => {
        try {
          await deliveryService.completeOrder(orderId, deliveryCode);
          await refreshAll();
          return { ok: true };
        } catch (e) {
          // After a timeout the order may have completed anyway; re-sync either way.
          await refreshAll();
          return { ok: false, message: getErrorMessage(e, 'Could not complete this order.'), code: e instanceof ApiError ? e.code : undefined };
        }
      }),
    [refreshAll, withBusy],
  );

  const reject = useCallback((orderId: string, reason: string) => withBusy(orderId, async () => {
    try { await deliveryService.rejectOrder(orderId, reason); await refreshAll(); return { ok: true }; }
    catch (e) { await refreshAll(); return { ok: false, message: getErrorMessage(e, 'Could not reject this assignment.'), code: e instanceof ApiError ? e.code : undefined }; }
  }), [refreshAll, withBusy]);

  const pickup = useCallback((orderId: string) => withBusy(orderId, async () => {
    try { await deliveryService.pickupOrder(orderId); await refreshAll(); return { ok: true }; }
    catch (e) { await refreshAll(); return { ok: false, message: getErrorMessage(e, 'Could not confirm pickup.'), code: e instanceof ApiError ? e.code : undefined }; }
  }), [refreshAll, withBusy]);

  const outForDelivery = useCallback((orderId: string) => withBusy(orderId, async () => {
    try { await deliveryService.markOutForDelivery(orderId); await refreshAll(); return { ok: true }; }
    catch (e) { await refreshAll(); return { ok: false, message: getErrorMessage(e, 'Could not update delivery status.'), code: e instanceof ApiError ? e.code : undefined }; }
  }), [refreshAll, withBusy]);

  const value = useMemo<DeliveryContextValue>(
    () => ({
      pending,
      active,
      history,
      hasActiveOrder: active.length > 0,
      isHydrated,
      isRefreshing,
      error,
      lastUpdated,
      refreshAll,
      isBusy: (orderId) => busy.has(orderId),
      accept,
      complete,
      reject, pickup, outForDelivery, isOnline, lastSeenAt, setOnline,
    }),
    [accept, active, busy, complete, error, history, isHydrated, isRefreshing, lastUpdated, pending, refreshAll, reject, pickup, outForDelivery, isOnline, lastSeenAt, setOnline],
  );

  return <DeliveryContext.Provider value={value}>{children}</DeliveryContext.Provider>;
}

export function useDelivery(): DeliveryContextValue {
  const context = useContext(DeliveryContext);
  if (!context) throw new Error('useDelivery must be used inside <DeliveryProvider>.');
  return context;
}
