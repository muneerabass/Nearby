import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as addressService from '../services/addressService';
import { getErrorMessage } from '../utils/errors';
import { Address } from '../types';
import { useAuth } from './AuthContext';

interface AddressContextValue {
  addresses: Address[];
  /** The address deliveries and the catalogue follow (default, else the first). */
  defaultAddress: Address | null;
  /** True once the first load has finished, successfully or not. */
  isHydrated: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setDefault: (address: Address) => Promise<void>;
  remove: (address: Address) => Promise<void>;
}

const AddressContext = createContext<AddressContextValue | undefined>(undefined);

/**
 * Single source of truth for the customer's addresses. Home, the cart, the
 * catalogue and the address screens all read from here, so changing or deleting
 * an address updates every one of them at once.
 */
export function AddressProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const enabled = isAuthenticated && user?.role === 'customer';
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    try {
      setAddresses(await addressService.listAddresses());
      setError(null);
    } catch (e) {
      // Keep the last known list so a blip never looks like "no addresses".
      setError(getErrorMessage(e, 'Could not load your addresses.'));
    } finally {
      setIsLoading(false);
      setIsHydrated(true);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setAddresses([]);
      setError(null);
      setIsHydrated(false);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  const setDefault = useCallback(
    async (address: Address) => {
      await addressService.setDefaultAddress(address.id);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (address: Address) => {
      await addressService.deleteAddress(address.id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<AddressContextValue>(
    () => ({
      addresses,
      defaultAddress: addresses.find((a) => a.is_default) ?? addresses[0] ?? null,
      isHydrated,
      isLoading,
      error,
      refresh,
      setDefault,
      remove,
    }),
    [addresses, error, isHydrated, isLoading, refresh, remove, setDefault],
  );

  return <AddressContext.Provider value={value}>{children}</AddressContext.Provider>;
}

export function useAddresses(): AddressContextValue {
  const ctx = useContext(AddressContext);
  if (!ctx) throw new Error('useAddresses must be used inside <AddressProvider>.');
  return ctx;
}
