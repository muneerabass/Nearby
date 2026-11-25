import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { categoriesForPincode, productsForPincode } from '../services/catalogService';
import { useAddresses } from './AddressContext';
import { getErrorMessage } from '../utils/errors';
import { CustomerCategory, Product, StoreSummary } from '../types';

/**
 * - loading:        first fetch (or a pincode change) in flight
 * - needsPincode:   no saved delivery address yet
 * - ready:          at least one store serves the pincode (products may be empty)
 * - notServiceable: no active store delivers to the pincode
 * - error:          the request itself failed (offline, server error)
 */
export type CatalogStatus = 'loading' | 'needsPincode' | 'ready' | 'notServiceable' | 'error';

interface StoreContextValue {
  status: CatalogStatus;
  isRefreshing: boolean;
  error: string | null;
  /** Non-null when a background refresh failed but stale products are still shown. */
  refreshError: string | null;
  /** Pincode of the default delivery address the catalog is shown for, if any. */
  pincode: string | null;
  /** Stores serving the current pincode. */
  stores: StoreSummary[];
  categories: CustomerCategory[];
  /** Union of in-stock products across every store serving the pincode. */
  products: Product[];
  refresh: () => Promise<void>;
  /** Lookup a product by id across the whole catalog. */
  getProductById: (productId: string) => Product | undefined;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // The catalogue always follows the customer's default delivery address.
  const { defaultAddress, isHydrated: addressesHydrated } = useAddresses();
  const pincode = defaultAddress?.pincode ?? null;
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CustomerCategory[]>([]);
  const [serviceable, setServiceable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!pincode) {
        setStores([]);
        setProducts([]);
        setCategories([]);
        setServiceable(false);
        setIsLoading(false);
        return;
      }
      if (silent) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);
      setRefreshError(null);
      try {
        const [catalog, categoryRows] = await Promise.all([
          productsForPincode(pincode),
          categoriesForPincode(pincode),
        ]);
        setServiceable(catalog.serviceable);
        setStores(catalog.stores);
        setCategories(categoryRows.filter((category) => category.is_active));
        setProducts(catalog.products);
      } catch (e) {
        const msg = getErrorMessage(e, 'Could not load products.');
        if (silent && products.length > 0) {
          // Background refresh failed but stale data is still usable.
          setRefreshError(msg);
        } else {
          setError(msg);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pincode],
  );

  useEffect(() => {
    if (!addressesHydrated) return;
    void load(false);
  }, [addressesHydrated, load]);

  let status: CatalogStatus;
  if (!addressesHydrated || isLoading) status = pincode || !addressesHydrated ? 'loading' : 'needsPincode';
  else if (!pincode) status = 'needsPincode';
  else if (error && products.length === 0) status = 'error';
  else status = serviceable ? 'ready' : 'notServiceable';

  const value = useMemo<StoreContextValue>(
    () => ({
      status,
      isRefreshing,
      error,
      refreshError,
      pincode,
      stores,
      categories,
      products,
      refresh: () => load(true),
      getProductById: (productId) => products.find((p) => p.id === productId),
    }),
    [categories, error, isRefreshing, load, pincode, products, refreshError, status, stores],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>.');
  return ctx;
}
