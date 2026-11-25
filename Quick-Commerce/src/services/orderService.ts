import { api } from './apiClient';
import { Order, OrderPage } from '../types';

/**
 * Places the order. The idempotency key makes a retry of the same checkout (after
 * a timeout, say) return the original order instead of creating a second one.
 */
export async function createOrder(addressId: string, idempotencyKey: string): Promise<Order> {
  return api.post<Order>('/orders', { address_id: addressId }, { auth: true, headers: { 'Idempotency-Key': idempotencyKey } });
}

export async function listOrders(before?: string | null, limit = 20): Promise<OrderPage> {
  const response = await api.get<OrderPage>('/orders', { auth: true, query: { limit, before } });
  return { orders: response.orders ?? [], next_before: response.next_before ?? null };
}

export async function getOrder(orderId: string): Promise<Order> {
  return api.get<Order>(`/orders/${orderId}`, { auth: true });
}

export async function cancelOrder(orderId: string, reason?: string): Promise<Order> {
  return api.post<Order>(`/orders/${orderId}/cancel`, { reason }, { auth: true });
}
