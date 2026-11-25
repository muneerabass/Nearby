import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { OrderEvent, OrderEventType } from '../types';
import { statusLook } from '../utils/orderStatus';
import { colors, radius, spacing } from '../theme';

interface OrderTimelineProps {
  events: OrderEvent[];
  /** Admin and vendor screens show who acted and the staff-only entries. */
  staff?: boolean;
}

const EVENT_TITLES: Partial<Record<OrderEventType, string>> = {
  rider_rejected: 'Rider rejected the order',
  reassigned: 'Taken off the rider and re-opened',
  admin_assigned: 'Assigned to a rider by admin',
  vendor_ready: 'Store marked it ready for pickup',
  delivery_code_locked: 'Delivery code locked',
  delivery_code_reset: 'Delivery code reset',
  auto_cancelled: 'Auto-cancelled',
};

function roleLabel(role: string): string {
  switch (role) {
    case 'delivery': return 'Rider';
    case 'vendor': return 'Store';
    case 'admin': return 'Admin';
    case 'customer': return 'Customer';
    default: return 'System';
  }
}

function eventColor(event: OrderEvent): string {
  switch (event.event_type) {
    case 'rider_rejected':
    case 'delivery_code_locked':
      return colors.error;
    case 'reassigned':
    case 'auto_cancelled':
      return colors.warning;
    case 'vendor_ready':
    case 'admin_assigned':
    case 'delivery_code_reset':
      return colors.primary;
    default:
      return statusLook(event.status).color;
  }
}

/** Vertical history of an order. The same component serves customers, admins and vendors. */
export function OrderTimeline({ events, staff = false }: OrderTimelineProps) {
  if (events.length === 0) return null;
  return (
    <View style={styles.card}>
      {events.map((event, index) => {
        const typed = event.event_type && event.event_type !== 'status_change' ? EVENT_TITLES[event.event_type] : undefined;
        const title = staff ? typed ?? (event.note || statusLook(event.status).label) : event.note || statusLook(event.status).label;
        const detail = staff && typed && event.note && event.note !== title ? event.note : null;
        const actor = staff ? [roleLabel(event.actor_role), event.actor_name].filter(Boolean).join(' · ') : null;
        return (
          <View key={`${event.event_type ?? event.status}-${event.created_at}-${index}`} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: eventColor(event) }]} />
              {index < events.length - 1 ? <View style={styles.line} /> : null}
            </View>
            <View style={styles.body}>
              <AppText variant="bodySmall" style={styles.title}>{title}</AppText>
              {detail ? <AppText variant="caption" color="textSecondary">{detail}</AppText> : null}
              <AppText variant="caption" color="textTertiary">
                {new Date(event.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {actor ? ` · ${actor}` : ''}
              </AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row' },
  rail: { width: 18, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: radius.pill, marginTop: 4 },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  body: { flex: 1, paddingBottom: spacing.md, paddingLeft: spacing.sm },
  title: { fontWeight: '600' },
});
