import { colors } from '../theme';
import { AttentionReason, Order, OrderStatus } from '../types';

export interface StatusLook {
  label: string;
  /** Short line for the status card on the order screen. */
  headline: string;
  color: string;
  soft: string;
}

const LOOKS: Record<OrderStatus, StatusLook> = {
  pending: { label: 'Placed', headline: 'Waiting for a rider to pick this up', color: colors.warning, soft: colors.warningSoft },
  accepted: { label: 'Accepted', headline: 'Your order is being prepared for pickup', color: colors.primary, soft: colors.primarySoft },
  picked_up: { label: 'Picked up', headline: 'Your order has left the store', color: colors.primary, soft: colors.primarySoft },
  out_for_delivery: { label: 'Out for delivery', headline: 'Your rider is heading to you', color: colors.primary, soft: colors.primarySoft },
  completed: { label: 'Delivered', headline: 'Delivered — enjoy!', color: colors.success, soft: colors.successSoft },
  cancelled: { label: 'Cancelled', headline: 'This order was cancelled', color: colors.error, soft: colors.errorSoft },
};

export function statusLook(status: OrderStatus): StatusLook {
  return LOOKS[status] ?? LOOKS.pending;
}

/** Orders that are still moving; everything else is final and needs no polling. */
export function isOpenOrder(order: Pick<Order, 'status'>): boolean {
  return order.status === 'pending' || order.status === 'accepted' || order.status === 'picked_up' || order.status === 'out_for_delivery';
}

export function whoCancelled(role?: string | null): string {
  if (role === 'customer') return 'You cancelled this order';
  if (role === 'admin') return 'Cancelled by support';
  if (role === 'vendor') return 'The store could not fulfil this order';
  if (role === 'system') return 'Cancelled automatically';
  return 'Cancelled';
}

/** Staff-voiced version of whoCancelled for admin and vendor screens. */
export function whoCancelledStaff(role?: string | null): string {
  if (role === 'customer') return 'Cancelled by the customer';
  if (role === 'admin') return 'Cancelled by admin';
  if (role === 'vendor') return 'Rejected by the store';
  if (role === 'system') return 'Auto-cancelled: no rider accepted in time';
  return 'Cancelled';
}

/** One-line status description for admin and vendor screens. */
export function staffHeadline(order: Pick<Order, 'status' | 'ready_at' | 'rider' | 'rider_rejections'>): string {
  switch (order.status) {
    case 'pending':
      return order.rider_rejections ? `Waiting for a rider (rejected ${order.rider_rejections}×)` : 'Waiting for a rider to accept';
    case 'accepted':
      return order.ready_at ? 'Rider accepted · ready for pickup' : 'Rider accepted · not marked ready yet';
    case 'picked_up':
      return 'Rider picked up the order';
    case 'out_for_delivery':
      return 'Out for delivery';
    case 'completed':
      return 'Delivered and paid';
    default:
      return 'Cancelled';
  }
}

export function minutesAgo(iso?: string | null): string {
  if (!iso) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** "12 min", "1h 5m", or "—" when there is nothing to average. */
export function durationLabel(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function shortOrderId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

const ATTENTION_COPY: Record<AttentionReason, string> = {
  pending_too_long: 'Waiting too long for a rider',
  no_rider_online: 'No rider online for this store',
  rider_rejected: 'A rider rejected this order',
  stale_in_progress: 'Held by a rider for too long',
  code_locked: 'Delivery code locked',
};

export function attentionLabel(reason: AttentionReason): string {
  return ATTENTION_COPY[reason] ?? reason;
}
