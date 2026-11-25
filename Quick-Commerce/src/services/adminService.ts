import { api } from './apiClient';
import { AdminProduct, AttentionOrder, Inventory, Order, Store, StoreStats, StoreVendor, User } from '../types';

export interface CategoryRow {
  id: string;
  name: string;
  image_url?: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at?: string;
}

export interface DashboardMetrics { total_orders: number; today_orders: number; pending_orders: number; accepted_orders: number; picked_up_orders: number; out_for_delivery_orders: number; rider_rejections_today: number; completed_orders: number; cancelled_orders: number; total_customers: number; total_products: number; active_delivery_partners: number; today_cod_collections: number; completed_revenue: number; low_stock_products: number }
export interface CategoryInput { name: string; image_url?: string | null; is_active?: boolean; display_order?: number }
export interface InventoryAdjustment { id: string; product_id: string; before_quantity: number; change_quantity: number; after_quantity: number; reason: string; created_at: string }

export async function listStores(): Promise<Store[]> {
  const response = await api.get<{ stores: Store[] }>('/admin/stores', { auth: true });
  return response.stores ?? [];
}

export async function listProducts(storeId?: string): Promise<AdminProduct[]> {
  // Products are strictly per-store; scope the list to the active store.
  const path = storeId ? `/admin/products?store_id=${encodeURIComponent(storeId)}` : '/admin/products';
  const response = await api.get<{ products: AdminProduct[] }>(path, { auth: true });
  return response.products ?? [];
}

export async function listInventory(storeId: string): Promise<Inventory[]> {
  const response = await api.get<{ inventory: Inventory[] }>(`/admin/stores/${storeId}/inventory`, { auth: true });
  return response.inventory ?? [];
}

export async function listCategories(): Promise<CategoryRow[]> {
  const response = await api.get<{ categories: CategoryRow[] }>('/admin/categories', { auth: true });
  return response.categories ?? [];
}
export async function getDashboard(storeId?: string): Promise<DashboardMetrics> { return api.get<DashboardMetrics>('/admin/dashboard', { auth: true, query: { store_id: storeId } }); }
export async function createCategory(input: CategoryInput): Promise<CategoryRow> { return api.post<CategoryRow>('/admin/categories', input, { auth: true }); }
export async function updateCategory(id: string, input: Partial<CategoryInput>): Promise<CategoryRow> { return api.patch<CategoryRow>(`/admin/categories/${id}`, input, { auth: true }); }
export async function archiveCategory(id: string): Promise<CategoryRow> { return api.delete<CategoryRow>(`/admin/categories/${id}`, { auth: true }); }

export interface StoreInput {
  name: string;
  address: string;
  /** Pincodes this store delivers to; customers in these areas see its products. */
  pincodes: string[];
  is_active?: boolean;
  contact_phone?: string | null;
  /** Creates the store's vendor login in the same request. */
  vendor?: StoreVendorInput;
}

export interface ProductInput {
  /** Required on create: the store this product belongs to. */
  store_id?: string;
  name: string;
  sku?: string | null;
  mrp?: number;
  unit?: string | null;
  description?: string | null;
  /** Paise (minor units). */
  price: number;
  image_url?: string | null;
  /** All product image URLs (cover first). */
  images?: string[];
  category_id?: string | null;
  is_active?: boolean;
  /** Initial stock for this product at its store (create only). */
  quantity?: number;
}

export async function createStore(input: StoreInput): Promise<Store> {
  return api.post<Store>('/admin/stores', input, { auth: true });
}

export async function updateStore(storeId: string, input: Partial<StoreInput>): Promise<Store> {
  return api.patch<Store>(`/admin/stores/${storeId}`, input, { auth: true });
}

/** Archives a store. The backend keeps orders/products/history and only stops
 * new customer traffic. The route is named DELETE for compatibility with the
 * original client contract, but it is not a physical deletion. */
export async function archiveStore(storeId: string): Promise<Store> {
	return api.delete<Store>(`/admin/stores/${storeId}`, { auth: true });
}

export async function createProduct(input: ProductInput): Promise<AdminProduct> {
  return api.post<AdminProduct>('/admin/products', input, { auth: true });
}

export async function updateProduct(productId: string, input: Partial<ProductInput>): Promise<AdminProduct> {
  return api.patch<AdminProduct>(`/admin/products/${productId}`, input, { auth: true });
}

export async function setInventory(storeId: string, productId: string, quantity: number, reason = 'Admin stock adjustment'): Promise<Inventory> {
  return api.put<Inventory>(`/admin/stores/${storeId}/inventory/${productId}`, { quantity, reason }, { auth: true });
}
export async function listInventoryAdjustments(storeId: string, productId: string): Promise<InventoryAdjustment[]> { const response = await api.get<{ adjustments: InventoryAdjustment[] }>(`/admin/stores/${storeId}/inventory/${productId}/adjustments`, { auth: true }); return response.adjustments ?? []; }

export async function createDeliveryUser(phone: string, name?: string): Promise<User> {
  return api.post<User>('/admin/delivery-users', { phone, name: name ?? null }, { auth: true });
}

export async function listDeliveryUsersForStore(storeId: string): Promise<User[]> {
  const response = await api.get<{ delivery_users: User[] }>(`/admin/stores/${storeId}/delivery-users`, { auth: true });
  return response.delivery_users ?? [];
}
export async function listCustomers(limit = 50, offset = 0): Promise<User[]> { const response = await api.get<{ customers: User[] }>(`/admin/customers?limit=${limit}&offset=${offset}`, { auth: true }); return response.customers ?? []; }
export async function setCustomerStatus(id: string, status: 'active' | 'blocked'): Promise<User> { return api.patch<User>(`/admin/customers/${id}/status`, { status }, { auth: true }); }

export async function assignDelivery(deliveryId: string, storeId: string): Promise<void> {
  await api.put<void>(`/admin/delivery-users/${deliveryId}/stores/${storeId}`, undefined, { auth: true });
}

/** Full delete: demotes the user to customer, unassigns from every store, and
 *  revokes all their sessions. Server refuses if they still have an active order. */
export async function deleteDeliveryUser(deliveryId: string): Promise<void> {
  await api.delete<void>(`/admin/delivery-users/${deliveryId}`, { auth: true });
}

export async function removeDeliveryAssignment(deliveryId: string, storeId: string): Promise<void> {
  await api.delete<void>(`/admin/delivery-users/${deliveryId}/stores/${storeId}`, { auth: true });
}

/** Admin order queue. `stale` lists accepted orders a rider has held too long. */
export async function listOrders(filter: { status?: 'pending' | 'accepted' | 'picked_up' | 'out_for_delivery' | 'completed' | 'cancelled'; stale?: boolean } = {}): Promise<Order[]> {
  const response = await api.get<{ orders: Order[] }>('/admin/orders', {
    auth: true,
    query: { status: filter.status, stale: filter.stale ? 'true' : undefined, limit: 50 },
  });
  return response.orders ?? [];
}

export async function cancelOrder(orderId: string, reason: string): Promise<Order> {
  return api.post<Order>(`/admin/orders/${orderId}/cancel`, { reason }, { auth: true });
}

/** Puts an accepted order back in the pending pool for another rider. */
export async function reassignOrder(orderId: string): Promise<Order> {
  return api.post<Order>(`/admin/orders/${orderId}/reassign`, undefined, { auth: true });
}
export async function assignOrder(orderId: string, deliveryId: string): Promise<Order> { return api.post<Order>(`/admin/orders/${orderId}/assign`, { delivery_id: deliveryId }, { auth: true }); }

// ---- Order monitoring -------------------------------------------------------

export interface OrderQuery {
  status?: string | string[];
  storeId?: string;
  riderId?: string;
  paymentStatus?: 'pending' | 'paid';
  q?: string;
  from?: string;
  to?: string;
  stale?: boolean;
  before?: string | null;
  limit?: number;
}

export interface OrderListPage {
  orders: Order[];
  next_before?: string | null;
}

/** Order history with filters and a cursor; pass `next_before` as `before` for the next page. */
export async function listOrdersPage(filter: OrderQuery = {}): Promise<OrderListPage> {
  const response = await api.get<OrderListPage>('/admin/orders', {
    auth: true,
    query: {
      status: Array.isArray(filter.status) ? filter.status.join(',') : filter.status,
      store_id: filter.storeId,
      rider_id: filter.riderId,
      payment_status: filter.paymentStatus,
      q: filter.q?.trim() || undefined,
      from: filter.from,
      to: filter.to,
      stale: filter.stale ? 'true' : undefined,
      before: filter.before ?? undefined,
      limit: filter.limit ?? 30,
    },
  });
  return { orders: response.orders ?? [], next_before: response.next_before ?? null };
}

/** The complete record of one order: items, fees, customer, rider and full timeline. */
export async function getOrder(orderId: string): Promise<Order> {
  return api.get<Order>(`/admin/orders/${orderId}`, { auth: true });
}

export async function listOrdersNeedingAttention(storeId?: string): Promise<AttentionOrder[]> {
  const response = await api.get<{ orders: AttentionOrder[] }>('/admin/orders/attention', { auth: true, query: { store_id: storeId } });
  return response.orders ?? [];
}

export async function resetDeliveryCode(orderId: string): Promise<Order> {
  return api.post<Order>(`/admin/orders/${orderId}/reset-delivery-code`, undefined, { auth: true });
}

export async function getStoreStats(storeId: string, range: { from?: string; to?: string; tzOffset?: number } = {}): Promise<StoreStats> {
  return api.get<StoreStats>(`/admin/stores/${storeId}/stats`, { auth: true, query: { from: range.from, to: range.to, tz_offset: range.tzOffset } });
}

// ---- Store vendors ----------------------------------------------------------

export interface StoreVendorInput { phone: string; name?: string | null }

/** Creates or replaces the store's vendor; the previous vendor becomes a customer. */
export async function setStoreVendor(storeId: string, input: StoreVendorInput): Promise<StoreVendor> {
  return api.put<StoreVendor>(`/admin/stores/${storeId}/vendor`, input, { auth: true });
}

export async function removeStoreVendor(storeId: string): Promise<void> {
  await api.delete<void>(`/admin/stores/${storeId}/vendor`, { auth: true });
}
