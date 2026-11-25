import AsyncStorage from '@react-native-async-storage/async-storage';

/** Namespaced so a future multi-tenant/staging build cannot collide. */
const PREFIX = '@zipp/';

export const StorageKeys = {
  authUser: `${PREFIX}auth_user`,
  authToken: `${PREFIX}auth_token`,
  authRefreshToken: `${PREFIX}auth_refresh_token`,
  recentSearches: `${PREFIX}recent_searches`,
  activeStoreId: `${PREFIX}active_store_id`,
  adminActiveStoreId: `${PREFIX}admin_active_store_id`,
  checkoutIdempotencyKey: `${PREFIX}checkout_idempotency_key`,
  deliveryCode: (orderId: string) => `${PREFIX}delivery_code_${orderId}`,
} as const;

/**
 * The server stores only an HMAC of a delivery code. This client cache holds
 * the one-time plaintext returned by order creation so the customer can still
 * see it after navigation/app restart. It is removed as soon as the order is
 * terminal; it is never sent back to the backend.
 */
export async function saveDeliveryCode(orderId: string, code: string): Promise<void> {
  if (!code) return;
  await storage.set(StorageKeys.deliveryCode(orderId), code);
}

export async function getDeliveryCode(orderId: string): Promise<string | null> {
  return storage.get<string>(StorageKeys.deliveryCode(orderId));
}

export async function clearDeliveryCode(orderId: string): Promise<void> {
  await storage.remove(StorageKeys.deliveryCode(orderId));
}

/**
 * Thin typed wrapper over AsyncStorage. Every read is defensive: a corrupt or
 * partially-written value must never crash the app on launch.
 */
export const storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage failures are non-fatal — the app stays usable for this session.
    }
  },

  async remove(...keys: string[]): Promise<void> {
    try {
      await AsyncStorage.multiRemove(keys);
    } catch {
      // no-op
    }
  },
};
