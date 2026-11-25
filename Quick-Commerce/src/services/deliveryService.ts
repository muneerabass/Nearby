import { api } from './apiClient';
import { Order } from '../types';

export async function listPendingOrders(): Promise<Order[]> {
  const response = await api.get<{ orders: Order[] }>('/delivery/orders', { auth: true });
  return response.orders ?? [];
}

/** A rider's own orders: 'accepted' (active) or 'completed' (history). */
export async function listMyOrders(status: 'accepted' | 'completed'): Promise<Order[]> {
  const response = await api.get<{ orders: Order[] }>(`/delivery/orders/mine?status=${status}`, { auth: true });
  return response.orders ?? [];
}

export async function getDeliveryOrder(orderId: string): Promise<Order> {
  return api.get<Order>(`/delivery/orders/${orderId}`, { auth: true });
}

export async function acceptOrder(orderId: string): Promise<Order> {
  return api.post<Order>(`/delivery/orders/${orderId}/accept`, undefined, { auth: true });
}

export async function rejectOrder(orderId: string, reason: string): Promise<void> {
  await api.post<void>(`/delivery/orders/${orderId}/reject`, { reason }, { auth: true });
}

export async function pickupOrder(orderId: string): Promise<Order> {
  return api.post<Order>(`/delivery/orders/${orderId}/pickup`, undefined, { auth: true });
}

export async function markOutForDelivery(orderId: string): Promise<Order> {
  return api.post<Order>(`/delivery/orders/${orderId}/out-for-delivery`, undefined, { auth: true });
}

export async function getAvailability(): Promise<{ online: boolean; last_seen_at?: string | null }> {
  return api.get<{ online: boolean; last_seen_at?: string | null }>('/delivery/availability', { auth: true });
}

export async function setAvailability(online: boolean): Promise<{ online: boolean; last_seen_at?: string | null }> {
  return api.put<{ online: boolean; last_seen_at?: string | null }>('/delivery/availability', { online }, { auth: true });
}

/** The customer reads their 6-digit delivery code to the rider; it proves the handover. */
export async function completeOrder(orderId: string, deliveryCode: string): Promise<Order> {
  return api.post<Order>(`/delivery/orders/${orderId}/complete`, { delivery_code: deliveryCode }, { auth: true });
}
