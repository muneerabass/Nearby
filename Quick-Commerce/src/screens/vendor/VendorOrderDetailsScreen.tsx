import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, Button, ErrorState, OrderStatusChip, OrderTimeline, OrderTotalsBlock, PressableScale, ReasonSheet } from '../../components';
import { useVendor } from '../../context/VendorContext';
import { useFocusedPolling } from '../../hooks/useFocusedPolling';
import * as vendorService from '../../services/vendorService';
import { Order } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { isOpenOrder, minutesAgo, shortOrderId, staffHeadline, whoCancelledStaff } from '../../utils/orderStatus';
import { colors, layout, radius, spacing } from '../../theme';
import type { VendorStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<VendorStackParamList, 'VendorOrderDetails'>;

const REJECT_REASONS = ['Item out of stock', 'Item damaged', 'Store is closing', 'Cannot prepare in time'];

export function VendorOrderDetailsScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const { markReady, reject, isBusy } = useVendor();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async (): Promise<boolean> => {
    try {
      setOrder(await vendorService.getOrder(orderId));
      setError(null);
      return true;
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load this order.'));
      return false;
    }
  }, [orderId]);

  // Keep an open order fresh; finished orders never change.
  useFocusedPolling(() => load(), 10_000, !order || isOpenOrder(order));

  const open = order ? order.status === 'pending' || order.status === 'accepted' : false;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <PressableScale onPress={() => navigation.goBack()} scaleTo={0.9} haptic="none" accessibilityRole="button" accessibilityLabel="Go back" style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </PressableScale>
        <AppText variant="heading2" style={styles.title}>{order ? shortOrderId(order.id) : 'Order'}</AppText>
        {order ? <OrderStatusChip status={order.status} /> : null}
      </View>

      {!order && !error ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : !order ? (
        <ErrorState message={error ?? ''} onRetry={() => void load()} style={styles.center} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]} showsVerticalScrollIndicator={false}>
          <View style={styles.summary}>
            <AppText variant="bodyStrong">{order.status === 'cancelled' ? whoCancelledStaff(order.cancelled_by_role) : staffHeadline(order)}</AppText>
            {order.status === 'cancelled' && order.cancel_reason ? <AppText variant="bodySmall" color="textSecondary">{order.cancel_reason}</AppText> : null}
            <AppText variant="caption" color="textTertiary" style={styles.summaryMeta}>
              Placed {minutesAgo(order.created_at)}
              {order.ready_at ? ` · ready ${minutesAgo(order.ready_at)}` : ''}
            </AppText>
          </View>

          {order.rider ? (
            <PressableScale onPress={() => void Linking.openURL(`tel:${order.rider?.phone}`)} scaleTo={0.985} haptic="none" accessibilityRole="button" accessibilityLabel="Call the rider" style={styles.riderCard}>
              <Ionicons name="bicycle" size={20} color={colors.primary} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{order.rider.name ?? 'Rider'}</AppText>
                <AppText variant="caption" color="textSecondary">{order.rider.phone}{order.accepted_at ? ` · accepted ${minutesAgo(order.accepted_at)}` : ''}</AppText>
              </View>
              <Ionicons name="call-outline" size={20} color={colors.primary} />
            </PressableScale>
          ) : order.status === 'pending' ? (
            <View style={styles.waitCard}>
              <Ionicons name="time-outline" size={18} color={colors.warning} />
              <AppText variant="bodySmall" style={styles.flex}>
                No rider has accepted yet{order.rider_rejections ? ` — ${order.rider_rejections} rider${order.rider_rejections === 1 ? '' : 's'} rejected it` : ''}.
              </AppText>
            </View>
          ) : null}

          <AppText variant="heading3" style={styles.section}>For</AppText>
          <View style={styles.card}>
            <AppText variant="bodySmall">{order.recipient_name} · {order.pincode}</AppText>
            <AppText variant="caption" color="textTertiary">Delivery address and phone are shared only with the rider.</AppText>
          </View>

          <AppText variant="heading3" style={styles.section}>Items</AppText>
          <OrderTotalsBlock order={order} />

          {order.events && order.events.length > 0 ? (
            <>
              <AppText variant="heading3" style={styles.section}>History</AppText>
              <OrderTimeline events={order.events} staff />
            </>
          ) : null}

          {open ? (
            <View style={styles.actions}>
              {!order.ready_at ? (
                <Button
                  label="Mark ready for pickup"
                  icon="checkmark"
                  loading={isBusy(order.id)}
                  onPress={async () => {
                    const result = await markReady(order.id);
                    if (!result.ok) Alert.alert('Could not mark ready', result.message ?? 'Try again.');
                    await load();
                  }}
                />
              ) : null}
              <Button label="Reject order" variant="danger" disabled={isBusy(order.id)} onPress={() => setRejecting(true)} />
            </View>
          ) : null}
        </ScrollView>
      )}

      <ReasonSheet
        visible={rejecting}
        title="Reject this order?"
        message="The customer sees this reason and the stock goes back on your shelf. This cannot be undone."
        confirmLabel="Reject order"
        suggestions={REJECT_REASONS}
        onClose={() => setRejecting(false)}
        onSubmit={async (reason) => {
          const result = await reject(orderId, reason);
          await load();
          return result.ok ? null : result.message ?? 'Could not reject this order.';
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: layout.gutter, paddingVertical: spacing.lg },
  backButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: layout.gutter },
  flex: { flex: 1 },
  summary: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryBorder },
  summaryMeta: { marginTop: spacing.xs },
  riderCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  waitCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  section: { marginTop: spacing.xl, marginBottom: spacing.sm },
  card: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  actions: { gap: spacing.md, marginTop: spacing.xl },
});
