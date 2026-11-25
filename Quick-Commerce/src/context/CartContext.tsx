import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Alert } from 'react-native';
import * as cartService from '../services/cartService';
import * as catalogService from '../services/catalogService';
import { ApiError } from '../services/apiClient';
import { getErrorMessage } from '../utils/errors';
import { buildReorderPlan } from '../utils/reorder';
import { Cart, CartIssue, CartLine, OrderItem, Product } from '../types';
import { useAddresses } from './AddressContext';
import { useAuth } from './AuthContext';

export interface CartTotals {
  itemCount: number;
  /** Items subtotal in paise. */
  subtotal: number;
  deliveryFee: number;
  handlingFee: number;
  /** What the customer pays. Decided by the server, never computed here. */
  total: number;
  amountToFreeDelivery: number;
  freeDeliveryThreshold: number;
  minimumOrderValue: number;
  amountToMinimumOrder: number;
}

interface CartContextValue {
  isHydrated: boolean;
  isMutating: boolean;
  cart: Cart | null;
  /** Set when the last refresh failed; the previous cart stays on screen meanwhile. */
  error: string | null;
  items: CartLine[];
  totals: CartTotals;
  /** Problems that block checkout (out of stock, store closed, address not served). */
  issues: CartIssue[];
  canCheckout: boolean;
  addItem: (product: Product) => Promise<void>;
  decrementByProductId: (productId: string) => Promise<void>;
  incrementLine: (line: CartLine) => Promise<void>;
  decrementLine: (line: CartLine) => Promise<void>;
  setLineQuantity: (line: CartLine, quantity: number) => Promise<void>;
  removeLine: (line: CartLine) => Promise<void>;
  clearCart: () => Promise<void>;
  refresh: () => Promise<void>;
  getQuantity: (productId: string) => number;
  getLineByProductId: (productId: string) => CartLine | undefined;
  reorderItems: (items: OrderItem[]) => Promise<{ added: number; unavailable: string[] }>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

function computeTotals(cart: Cart | null): CartTotals {
  const items = cart?.items ?? [];
  return {
    itemCount: items.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: cart?.subtotal_amount ?? 0,
    deliveryFee: cart?.delivery_fee ?? 0,
    handlingFee: cart?.handling_fee ?? 0,
    total: cart?.total_amount ?? 0,
    amountToFreeDelivery: cart?.amount_to_free_delivery ?? 0,
    freeDeliveryThreshold: cart?.free_delivery_threshold ?? 0,
    minimumOrderValue: cart?.minimum_order_value ?? 0,
    amountToMinimumOrder: cart?.amount_to_minimum_order ?? 0,
  };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const { defaultAddress } = useAddresses();
  const addressId = defaultAddress?.id ?? null;
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  // Only customers have carts; admins/delivery don't interact with it.
  const canHaveCart = isAuthenticated && user?.role === 'customer';

  const refresh = useCallback(async () => {
    if (!canHaveCart) {
      setCart(null);
      setIsHydrated(true);
      return;
    }
    try {
      setCart(await cartService.getCart(addressId));
      setError(null);
    } catch (e) {
      // Never pretend the cart is empty: keep what we had and flag the failure.
      setError(getErrorMessage(e, 'Could not load your cart.'));
    } finally {
      setIsHydrated(true);
    }
  }, [addressId, canHaveCart]);

  // Re-price whenever the user, or the address they are shopping for, changes.
  useEffect(() => {
    setIsHydrated(false);
    void refresh();
  }, [refresh]);

  const run = useCallback(async (action: () => Promise<Cart>, failureTitle: string) => {
    setIsMutating(true);
    try {
      setCart(await action());
      setError(null);
    } catch (e) {
      Alert.alert(failureTitle, getErrorMessage(e));
    } finally {
      setIsMutating(false);
    }
  }, []);

  const addItem = useCallback(
    async (product: Product) => {
      if (!canHaveCart) return;
      setIsMutating(true);
      try {
        setCart(await cartService.addCartItem(product.store_id, product.id, 1, addressId));
        setError(null);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'cart_store_mismatch') {
          // A cart holds one store's items; offer to replace it with this product's store.
          const current = cart?.store_name ? `from ${cart.store_name}` : 'from another store';
          await new Promise<void>((resolve) => {
            Alert.alert(
              'Start a new cart?',
              `Your cart has items ${current}. Replace them with items from ${product.store_name}?`,
              [
                { text: 'Keep current cart', style: 'cancel', onPress: () => resolve() },
                {
                  text: 'Replace cart',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await cartService.clearCart();
                      setCart(await cartService.addCartItem(product.store_id, product.id, 1, addressId));
                    } catch (inner) {
                      Alert.alert('Could not switch', getErrorMessage(inner));
                    } finally {
                      resolve();
                    }
                  },
                },
              ],
            );
          });
        } else {
          Alert.alert('Could not add item', getErrorMessage(e));
        }
      } finally {
        setIsMutating(false);
      }
    },
    [addressId, canHaveCart, cart?.store_name],
  );

  const setLineQuantity = useCallback(
    async (line: CartLine, quantity: number) => {
      if (!canHaveCart) return;
      if (quantity <= 0) {
        await run(() => cartService.deleteCartItem(line.id, addressId), 'Could not remove item');
      } else {
        await run(() => cartService.updateCartItem(line.id, quantity, addressId), 'Could not update item');
      }
    },
    [addressId, canHaveCart, run],
  );

  const incrementLine = useCallback((line: CartLine) => setLineQuantity(line, line.quantity + 1), [setLineQuantity]);
  const decrementLine = useCallback((line: CartLine) => setLineQuantity(line, line.quantity - 1), [setLineQuantity]);

  const removeLine = useCallback(
    async (line: CartLine) => {
      if (!canHaveCart) return;
      await run(() => cartService.deleteCartItem(line.id, addressId), 'Could not remove item');
    },
    [addressId, canHaveCart, run],
  );

  const clearCart = useCallback(async () => {
    if (!canHaveCart) return;
    setIsMutating(true);
    try {
      await cartService.clearCart();
      setCart(await cartService.getCart(addressId));
    } catch (e) {
      Alert.alert('Could not empty cart', getErrorMessage(e));
    } finally {
      setIsMutating(false);
    }
  }, [addressId, canHaveCart]);

  const reorderItems = useCallback(async (items: OrderItem[]) => {
    if (!canHaveCart) return { added: 0, unavailable: items.map((item) => item.product_name) };
    const checked = await Promise.all(items.map(async (item) => {
      try {
        const product = await catalogService.getProductByID(item.product_id);
        return { item, product };
      } catch {
        return { item, product: null };
      }
    }));
    const plan = buildReorderPlan(items, checked.map(({ product }) => product));
    if (plan.available.length === 0) return { added: 0, unavailable: plan.unavailable };

    if (cart?.store_id && cart.store_id !== plan.storeId) {
      const replace = await new Promise<boolean>((resolve) => {
          Alert.alert('Replace current cart?', `Your cart is from ${cart.store_name ?? 'another store'}. Buy Again needs ${plan.available[0].product.store_name}.`, [
          { text: 'Keep current cart', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Replace cart', style: 'destructive', onPress: () => resolve(true) },
        ]);
      });
      if (!replace) return { added: 0, unavailable: [...plan.unavailable, ...plan.available.map(({ item }) => item.product_name)] };
      await cartService.clearCart();
    }

    let nextCart = await cartService.getCart(addressId);
    let added = 0;
    for (const { item, product, quantity } of plan.available) {
      try {
        nextCart = await cartService.addCartItem(product.store_id, product.id, quantity, addressId);
        added += quantity;
      } catch {
        plan.unavailable.push(item.product_name);
      }
    }
    setCart(nextCart);
    setError(null);
    return { added, unavailable: plan.unavailable };
  }, [addressId, canHaveCart, cart?.store_id, cart?.store_name]);

  const lineMap = useMemo(() => {
    const map = new Map<string, CartLine>();
    (cart?.items ?? []).forEach((line) => map.set(line.product_id, line));
    return map;
  }, [cart]);

  const decrementByProductId = useCallback(
    async (productId: string) => {
      const line = lineMap.get(productId);
      if (line) await decrementLine(line);
    },
    [decrementLine, lineMap],
  );

  const totals = useMemo(() => computeTotals(cart), [cart]);

  const value = useMemo<CartContextValue>(
    () => ({
      isHydrated,
      isMutating,
      cart,
      error,
      items: cart?.items ?? [],
      totals,
      issues: cart?.issues ?? [],
      canCheckout: cart?.can_checkout ?? false,
      addItem,
      decrementByProductId,
      incrementLine,
      decrementLine,
      setLineQuantity,
      removeLine,
      clearCart,
      refresh,
      getQuantity: (productId) => lineMap.get(productId)?.quantity ?? 0,
      getLineByProductId: (productId) => lineMap.get(productId),
      reorderItems,
    }),
    [addItem, cart, clearCart, decrementByProductId, decrementLine, error, incrementLine, isHydrated, isMutating, lineMap, refresh, removeLine, reorderItems, setLineQuantity, totals],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>.');
  return ctx;
}

export function useCartQuantity(productId: string): number {
  const { getQuantity } = useCart();
  return getQuantity(productId);
}
