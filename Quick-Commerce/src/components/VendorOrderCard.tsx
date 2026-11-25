import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Button } from './Button';
import { OrderStatusChip } from './OrderStatusChip';
import { PressableScale } from './PressableScale';
import { Order } from '../types';
import { minutesAgo, shortOrderId, staffHeadline, whoCancelledStaff } from '../utils/orderStatus';
import { formatPrice } from '../utils/price';
import { colors, radius, spacing } from '../theme';

interface VendorOrderCardProps {
  order: Order;
  onPress: () => void;
  busy?: boolean;
  /** Shown on pending and accepted orders that are not marked ready yet. */
  onReady?: () => void;
  /** Shown on pending and accepted orders. */
  onReject?: () => void;
}

/** One order as the store sees it: what to pack, who is bringing it, and what to do next. */
export function VendorOrderCard({ order, onPress, busy, onReady, onReject }: VendorOrderCardProps) {
  const open = order.status === 'pending' || order.status === 'accepted';
  const summary = order.items.map((item) => `${item.product_name} ×${item.quantity}`).join(', ');
  const riderLine = order.rider
    ? `Rider: ${order.rider.name ?? 'assigned'}${order.accepted_at ? ` · accepted ${minutesAgo(order.accepted_at)}` : ''}`
    : null;

  return (
    <PressableScale onPress={onPress} scaleTo={0.985} haptic="none" accessibilityRole="button" accessibilityLabel={`Order ${shortOrderId(order.id)}`} style={styles.card}>
      <View style={styles.header}>
        <AppText variant="bodyStrong">{shortOrderId(order.id)}</AppText>
        <OrderStatusChip status={order.status} />
      </View>
      <AppText variant="caption" color="textTertiary" style={styles.line}>
        {order.recipient_name} · {order.pincode} · placed {minutesAgo(order.created_at)}
      </AppText>
      <AppText variant="bodySmall" style={styles.items} numberOfLines={2}>{summary}</AppText>
      <View style={styles.totalRow}>
        <AppText variant="caption" color="textSecondary">{order.items.length} item{order.items.length === 1 ? '' : 's'}</AppText>
        <AppText variant="bodyStrong">{formatPrice(order.total_amount)}</AppText>
      </View>

      <View style={styles.statusBox}>
        <Ionicons
          name={order.status === 'cancelled' ? 'close-circle-outline' : order.rider || order.status === 'completed' ? 'bicycle' : 'time-outline'}
          size={16}
          color={order.status === 'cancelled' ? colors.error : colors.primary}
        />
        <View style={styles.flex}>
          <AppText variant="caption" color={order.status === 'cancelled' ? 'error' : 'text'}>
            {order.status === 'cancelled' ? whoCancelledStaff(order.cancelled_by_role) : staffHeadline(order)}
          </AppText>
          {order.status === 'cancelled' && order.cancel_reason ? <AppText variant="caption" color="textSecondary">{order.cancel_reason}</AppText> : null}
          {order.status !== 'cancelled' && riderLine ? <AppText variant="caption" color="textSecondary">{riderLine}</AppText> : null}
        </View>
        {order.ready_at && open ? (
          <View style={styles.readyPill}>
            <AppText variant="captionStrong" color="success">Ready</AppText>
          </View>
        ) : null}
      </View>

      {open && (onReady || onReject) ? (
        <View style={styles.actions}>
          {onReady && !order.ready_at ? <Button label="Mark ready" size="sm" icon="checkmark" loading={busy} disabled={busy} onPress={onReady} style={styles.action} /> : null}
          {onReject ? <Button label="Reject" size="sm" variant="danger" disabled={busy} onPress={onReject} style={styles.action} /> : null}
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  line: { marginTop: spacing.xs },
  items: { marginTop: spacing.sm },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  statusBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  readyPill: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill, backgroundColor: colors.successSoft },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1 },
});
