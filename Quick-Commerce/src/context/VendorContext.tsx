import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as vendorService from '../services/vendorService';
import { ApiError } from '../services/apiClient';
import { useAuth } from './AuthContext';
import { getErrorMessage } from '../utils/errors';
import { Order, Store } from '../types';

const POLL_INTERVAL_MS = 15_000;
/** Statuses that still need the store's attention or are on the road. */
const OPEN_STATUSES = ['pending', 'accepted', 'picked_up', 'out_for_delivery'];

export interface VendorActionResult {
  ok: boolean;
  message?: string;
  code?: string;
}

interface VendorContextValue {
  store: Store | null;
  /** Orders that are not finished yet, oldest first (the next one to pack is on top). */
  openOrders: Order[];
  /** Waiting for a rider to accept. */
  newCount: number;
  isHydrated: boolean;
  isRefreshing: boolean;
  /** Set while the latest refresh failed; lists keep their last good data. */
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<boolean>;
  isBusy: (orderId: string) => boolean;
  markReady: (orderId: string) => Promise<VendorActionResult>;
  reject: (orderId: string, reason: string) => Promise<VendorActionResult>;
  setOpen: (open: boolean) => Promise<VendorActionResult>;
  saveContactPhone: (phone: string) => Promise<VendorActionResult>;
}

const VendorContext = createContext<VendorContextValue | undefined>(undefined);

export function VendorProvider({ children }: { children: React.ReactNode }) {
  const { refreshMe } = useAuth();
  const [store, setStore] = useState<Store | null>(null);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const busyRef = useRef<Set<string>>(new Set());
  const inFlight = useRef<Promise<boolean> | null>(null);

  // Each call updates its own slice and only on success, so one failure never blanks a screen.
  const refresh = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    const request = (async () => {
      setIsRefreshing(true);
      const [storeResult, ordersResult] = await Promise.allSettled([
        vendorService.getStore(),
        vendorService.listOrders({ status: OPEN_STATUSES, limit: 100 }),
      ]);
      if (storeResult.status === 'fulfilled') setStore(storeResult.value);
      if (ordersResult.status === 'fulfilled') {
        setOpenOrders([...ordersResult.value.orders].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      }
      const failure = [storeResult, ordersResult].find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failure) {
        // The vendor lost access (blocked, demoted or unlinked): re-read the profile so the app re-routes.
        if (failure.reason instanceof ApiError && failure.reason.code === 'vendor_not_assigned') void refreshMe();
        setError(getErrorMessage(failure.reason, 'Could not refresh orders.'));
      } else {
        setError(null);
        setLastUpdated(new Date());
      }
      setIsHydrated(true);
      setIsRefreshing(false);
      return !failure;
    })();
    inFlight.current = request;
    try {
      return await request;
    } finally {
      inFlight.current = null;
    }
  }, [refreshMe]);

  // Poll in the foreground and catch up the moment the app returns.
  useEffect(() => {
    void refresh();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let failures = 0;
    const schedule = (delay: number) => {
      if (stopped || timer) return;
      timer = setTimeout(async () => {
        timer = null;
        const ok = await refresh();
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
        void refresh();
        schedule(POLL_INTERVAL_MS);
      } else {
        stop();
      }
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, [refresh]);

  const withBusy = useCallback(async (orderId: string, action: () => Promise<VendorActionResult>): Promise<VendorActionResult> => {
    if (busyRef.current.has(orderId)) return { ok: false, message: 'Already working on this order…' };
    busyRef.current.add(orderId);
    setBusy(new Set(busyRef.current));
    try {
      return await action();
    } finally {
      busyRef.current.delete(orderId);
      setBusy(new Set(busyRef.current));
    }
  }, []);

  const markReady = useCallback(
    (orderId: string) =>
      withBusy(orderId, async () => {
        try {
          await vendorService.markReady(orderId);
          await refresh();
          return { ok: true };
        } catch (e) {
          await refresh(); // a 409 means our list was stale
          return { ok: false, message: getErrorMessage(e, 'Could not mark this order ready.'), code: e instanceof ApiError ? e.code : undefined };
        }
      }),
    [refresh, withBusy],
  );

  const reject = useCallback(
    (orderId: string, reason: string) =>
      withBusy(orderId, async () => {
        try {
          await vendorService.rejectOrder(orderId, reason);
          await refresh();
          return { ok: true };
        } catch (e) {
          await refresh();
          return { ok: false, message: getErrorMessage(e, 'Could not reject this order.'), code: e instanceof ApiError ? e.code : undefined };
        }
      }),
    [refresh, withBusy],
  );

  const setOpen = useCallback(async (open: boolean): Promise<VendorActionResult> => {
    try {
      setStore(await vendorService.updateStore({ is_active: open }));
      return { ok: true };
    } catch (e) {
      return { ok: false, message: getErrorMessage(e, 'Could not update the store.'), code: e instanceof ApiError ? e.code : undefined };
    }
  }, []);

  const saveContactPhone = useCallback(async (phone: string): Promise<VendorActionResult> => {
    try {
      setStore(await vendorService.updateStore({ contact_phone: phone.trim() }));
      return { ok: true };
    } catch (e) {
      return { ok: false, message: getErrorMessage(e, 'Could not save the contact number.') };
    }
  }, []);

  const value = useMemo<VendorContextValue>(
    () => ({
      store,
      openOrders,
      newCount: openOrders.filter((o) => o.status === 'pending').length,
      isHydrated,
      isRefreshing,
      error,
      lastUpdated,
      refresh,
      isBusy: (orderId) => busy.has(orderId),
      markReady,
      reject,
      setOpen,
      saveContactPhone,
    }),
    [busy, error, isHydrated, isRefreshing, lastUpdated, markReady, openOrders, refresh, reject, saveContactPhone, setOpen, store],
  );

  return <VendorContext.Provider value={value}>{children}</VendorContext.Provider>;
}

export function useVendor(): VendorContextValue {
  const context = useContext(VendorContext);
  if (!context) throw new Error('useVendor must be used inside <VendorProvider>.');
  return context;
}
