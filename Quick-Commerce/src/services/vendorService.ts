import { api } from './apiClient';
import { AdminProduct, Inventory, Order, OrderPage, Store, StoreStats, User } from '../types';
import type { CategoryRow, ProductInput } from './adminService';

/** Store-owner API. The server picks the store from the vendor's login, so none of
 * these calls pass a store id. */

export interface VendorOrderQuery {
  status?: string | string[];
  q?: string;
  from?: string;
  to?: string;
  before?: string | null;
  limit?: number;
}

export async function getStore(): Promise<Store> {
  return api.get<Store>('/vendor/store', { auth: true });
}

export async function updateStore(input: { is_active?: boolean; contact_phone?: string | null }): Promise<Store> {
  return api.patch<Store>('/vendor/store', input, { auth: true });
}

export async function listOrders(filter: VendorOrderQuery = {}): Promise<OrderPage> {
  const response = await api.get<OrderPage>('/vendor/orders', {
    auth: true,
    query: {
      status: Array.isArray(filter.status) ? filter.status.join(',') : filter.status,
      q: filter.q?.trim() || undefined,
      from: filter.from,
      to: filter.to,
      before: filter.before ?? undefined,
      limit: filter.limit ?? 30,
    },
  });
  return { orders: response.orders ?? [], next_before: response.next_before ?? null };
}

export async function getOrder(orderId: string): Promise<Order> {
  return api.get<Order>(`/vendor/orders/${orderId}`, { auth: true });
}

export async function markReady(orderId: string): Promise<Order> {
  return api.post<Order>(`/vendor/orders/${orderId}/ready`, undefined, { auth: true });
}

export async function rejectOrder(orderId: string, reason: string): Promise<Order> {
  return api.post<Order>(`/vendor/orders/${orderId}/reject`, { reason }, { auth: true });
}

/** `tzOffset` is the viewer's UTC offset in minutes so daily buckets follow their local day. */
export async function getStats(range: { from?: string; to?: string; tzOffset?: number } = {}): Promise<StoreStats> {
  return api.get<StoreStats>('/vendor/stats', { auth: true, query: { from: range.from, to: range.to, tz_offset: range.tzOffset } });
}

export async function listRiders(): Promise<User[]> {
  const response = await api.get<{ riders: User[] }>('/vendor/riders', { auth: true });
  return response.riders ?? [];
}

export async function listCategories(): Promise<CategoryRow[]> {
  const response = await api.get<{ categories: CategoryRow[] }>('/vendor/categories', { auth: true });
  return response.categories ?? [];
}

export async function listProducts(): Promise<AdminProduct[]> {
  const response = await api.get<{ products: AdminProduct[] }>('/vendor/products', { auth: true });
  return response.products ?? [];
}

export async function createProduct(input: Omit<ProductInput, 'store_id'>): Promise<AdminProduct> {
  return api.post<AdminProduct>('/vendor/products', input, { auth: true });
}

export async function updateProduct(productId: string, input: Partial<Omit<ProductInput, 'store_id' | 'quantity'>>): Promise<AdminProduct> {
  return api.patch<AdminProduct>(`/vendor/products/${productId}`, input, { auth: true });
}

export async function listInventory(): Promise<Inventory[]> {
  const response = await api.get<{ inventory: Inventory[] }>('/vendor/inventory', { auth: true });
  return response.inventory ?? [];
}

export async function setInventory(productId: string, quantity: number, reason = 'Updated by vendor'): Promise<Inventory> {
  return api.put<Inventory>(`/vendor/inventory/${productId}`, { quantity, reason }, { auth: true });
}
