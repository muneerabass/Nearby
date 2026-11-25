import type { CategoryIconName } from '../data/categoryLooks';

/**
 * Domain types mirror the Go backend DTOs (quick-commerce/internal/dto/*).
 *
 * Monetary fields are integer paise (minor units); format with utils/price.
 * UUIDs are plain strings. Timestamps are ISO strings.
 */

export type UserRole = 'customer' | 'admin' | 'delivery' | 'vendor';

export interface User {
  id: string;
  phone: string;
  name?: string | null;
  phone_verified_at?: string | null;
  status: string; // active | deleted
  is_online?: boolean;
  last_seen_at?: string | null;
  role: UserRole;
  referral_code: string;
  referred_by_code?: string | null;
  /** The store a vendor manages; only set for vendors. */
  store?: StoreSummary | null;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  session_id: string;
}

/** Server-side product record returned by /catalog/products. */
export interface Product {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  mrp?: number;
  unit?: string | null;
  /** Price in paise (minor units). */
  price: number;
  image_url?: string | null;
  /** All product images (cover first). Falls back to image_url when empty. */
  images?: string[] | null;
  category_id?: string | null;
  category_name?: string | null;
  /** Stock at the product's store (0 if not stocked). */
  quantity: number;
  /** The store that sells (and will deliver) this product. */
  store_id: string;
  store_name: string;
}

export interface CustomerCategory {
  id: string;
  name: string;
  image_url?: string | null;
  is_active: boolean;
  display_order: number;
  product_count: number;
}

export interface Store {
  id: string;
  name: string;
  address: string;
  /** Pincodes this store delivers to (managed by the admin). */
  pincodes: string[];
  is_active: boolean;
  /** Returned when a store is deactivated: orders still in flight that will be served. */
  open_orders?: number;
  contact_phone?: string | null;
  /** Who closed the store; a vendor cannot reopen a store an admin closed. */
  closed_by_role?: 'admin' | 'vendor' | null;
  /** The person who runs the store (admin view). */
  vendor?: StoreVendor | null;
}

export interface StoreVendor {
  id: string;
  name?: string | null;
  phone: string;
  status: string;
}

export interface StoreSummary {
  id: string;
  name: string;
}

/** Home catalog for one pincode: union of products of all stores serving it. */
export interface PincodeCatalog {
  pincode: string;
  serviceable: boolean;
  stores: StoreSummary[];
  products: Product[];
}

/** Light client-side type used by the Categories/Home rails. */
export interface CategoryRef {
  id: string;
  name: string;
  image_url?: string | null;
  icon: CategoryIconName;
  tint: string;
  color: string;
  productCount: number;
  /** Kept as a navigation alias; dynamic categories use their backend id. */
  categoryKey: string;
}

export interface Address {
  id: string;
  label: string; // "Home" | "Work" | "Other" | free text
  recipient_name: string;
  phone: string;
  address_line1: string;
  address_line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  delivery_instructions?: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CartLine {
  id: string;
  product_id: string;
  product_name: string;
  image_url?: string | null;
  unit_price: number; // paise
  quantity: number;
  line_total: number; // paise
  /** Stock the store has right now; below `quantity` the line can't be fulfilled. */
  available_quantity: number;
}

export type CartIssueCode = 'out_of_stock' | 'insufficient_stock' | 'store_inactive' | 'not_serviceable' | 'minimum_order';

/** A reason the cart can't be checked out as it stands. */
export interface CartIssue {
  code: CartIssueCode;
  item_id?: string | null;
  message: string;
  available_quantity?: number | null;
}

export interface Cart {
  id: string;
  store_id?: string | null;
  store_name?: string | null;
  items: CartLine[];
  /** Items only. */
  subtotal_amount: number;
  delivery_fee: number;
  handling_fee: number;
  /** What the customer pays: subtotal + fees. The server decides all of these. */
  total_amount: number;
  free_delivery_threshold: number;
  amount_to_free_delivery: number;
  minimum_order_value: number;
  amount_to_minimum_order: number;
  issues: CartIssue[];
  can_checkout: boolean;
}

export type OrderStatus = 'pending' | 'accepted' | 'picked_up' | 'out_for_delivery' | 'completed' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid';
export type PaymentMethod = 'cod';

export interface OrderItem {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export type OrderEventType =
  | 'status_change'
  | 'rider_rejected'
  | 'reassigned'
  | 'admin_assigned'
  | 'vendor_ready'
  | 'delivery_code_locked'
  | 'delivery_code_reset'
  | 'auto_cancelled';

export interface OrderEvent {
  status: OrderStatus;
  actor_role: string;
  note?: string | null;
  created_at: string;
  /** The fields below are only sent to admins and vendors. */
  event_type?: OrderEventType;
  visibility?: 'all' | 'staff';
  actor_name?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface OrderPage {
  orders: Order[];
  next_before?: string | null;
}

export interface OrderRider {
  id?: string;
  name?: string | null;
  phone: string;
  is_online?: boolean;
}

export interface Order {
  id: string;
  store_id: string;
  store_name?: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  total_amount: number;
  recipient_name: string;
  delivery_phone: string;
  address_line1: string;
  address_line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  delivery_instructions?: string | null;
  accepted_by?: string | null;
  accepted_at?: string | null;
  picked_up_at?: string | null;
  out_for_delivery_at?: string | null;
  completed_at?: string | null;
  subtotal_amount: number;
  delivery_fee: number;
  handling_fee: number;
  /** Cash the rider collects at the door (0 once settled or cancelled). */
  amount_to_collect: number;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  cancelled_by_role?: string | null;
  /** Only sent to the customer who owns the order while it is open. */
  delivery_code?: string;
  rider?: OrderRider | null;
  events?: OrderEvent[];
  ready_at?: string | null;
  /** Admin and vendor views only. Vendors never receive the customer. */
  customer?: { id: string; name?: string | null; phone: string } | null;
  rider_rejections?: number;
  delivery_code_attempts?: number;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
  status_updated_at?: string;
}

export interface AdminStore extends Store {}

export interface AdminProduct {
  id: string;
  /** The store this product belongs to (products are strictly per-store). */
  store_id?: string;
  name: string;
  description?: string | null;
  price: number;
  image_url?: string | null;
  /** All product images (cover first). */
  images?: string[] | null;
  category_id?: string | null;
  /** Inventory at the admin's currently selected store, if known. */
  quantity?: number;
	sku?: string | null;
	mrp?: number;
	unit?: string | null;
	is_active?: boolean;
}

export interface Inventory {
  id: string;
  store_id: string;
  product_id: string;
  quantity: number;
  updated_at: string;
	low_stock_threshold?: number;
}

export type AttentionReason = 'pending_too_long' | 'no_rider_online' | 'rider_rejected' | 'stale_in_progress' | 'code_locked';

export interface AttentionOrder {
  order: Order;
  reasons: AttentionReason[];
}

/** Mirrors dto.StoreStatsResponse. Money is paise; averages are seconds. */
export interface StoreStats {
  store_id: string;
  from: string;
  to: string;
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  active_orders: number;
  by_status: Record<string, number>;
  cancelled_by_role: Record<string, number>;
  completed_revenue: number;
  avg_seconds_to_accept?: number | null;
  avg_seconds_to_ready?: number | null;
  avg_seconds_accept_to_delivered?: number | null;
  rider_rejections: number;
  assigned_riders: number;
  online_riders: number;
  top_products: { product_id: string; product_name: string; quantity: number; revenue: number }[];
  daily: { date: string; orders: number; completed: number; revenue: number }[];
}
