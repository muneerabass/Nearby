import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Order } from '../types';
import { formatPrice } from '../utils/price';
import { colors, radius, spacing } from '../theme';

type TotalsOrder = Pick<Order, 'items' | 'subtotal_amount' | 'delivery_fee' | 'handling_fee' | 'total_amount' | 'status' | 'payment_status'>;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText variant={strong ? 'bodyStrong' : 'bodySmall'} color={strong ? 'text' : 'textSecondary'}>{label}</AppText>
      <AppText variant={strong ? 'bodyStrong' : 'bodySmall'}>{value}</AppText>
    </View>
  );
}

/** Items, item total, fees and grand total in one card (all amounts in paise). */
export function OrderTotalsBlock({ order, totalLabel }: { order: TotalsOrder; totalLabel?: string }) {
  const label = totalLabel ?? (order.status === 'completed' || order.payment_status === 'paid' ? 'Paid' : order.status === 'cancelled' ? 'Order total' : 'To pay');
  return (
    <View style={styles.card}>
      {order.items.map((item) => (
        <View key={item.product_id} style={styles.row}>
          <View style={styles.flex}>
            <AppText variant="bodySmall">{item.product_name}</AppText>
            <AppText variant="caption" color="textTertiary">{formatPrice(item.unit_price)} × {item.quantity}</AppText>
          </View>
          <AppText variant="bodyStrong">{formatPrice(item.line_total)}</AppText>
        </View>
      ))}
      <View style={styles.divider} />
      <Row label="Item total" value={formatPrice(order.subtotal_amount)} />
      <Row label="Delivery fee" value={order.delivery_fee === 0 ? 'FREE' : formatPrice(order.delivery_fee)} />
      <Row label="Handling charge" value={formatPrice(order.handling_fee)} />
      <View style={styles.divider} />
      <Row label={label} value={formatPrice(order.total_amount)} strong />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  flex: { flex: 1, paddingRight: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
});
