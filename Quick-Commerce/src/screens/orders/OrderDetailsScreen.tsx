import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, ErrorState, PressableScale } from '../../components';
import { useFocusedPolling } from '../../hooks/useFocusedPolling';
import { useCart } from '../../context/CartContext';
import * as orderService from '../../services/orderService';
import { clearDeliveryCode, getDeliveryCode } from '../../services/storage';
import { ApiError } from '../../services/apiClient';
import { Order } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { isOpenOrder, statusLook, whoCancelled } from '../../utils/orderStatus';
import { formatPrice } from '../../utils/price';
import { colors, fontFamilies, layout, radius, spacing } from '../../theme';
import type { MainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'OrderDetails'>;

const POLL_INTERVAL_MS = 10_000;

export function OrderDetailsScreen({ navigation, route }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staleError, setStaleError] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const { reorderItems } = useCart();

  const hasOrder = useRef(false);

  const fetchOrder = useCallback(async (): Promise<boolean> => {
    try {
      const next = await orderService.getOrder(route.params.orderId);
      setOrder(next);
      if (next.status === 'completed' || next.status === 'cancelled') {
        await clearDeliveryCode(next.id);
        setDeliveryCode(null);
      } else {
        setDeliveryCode(await getDeliveryCode(next.id));
      }
      hasOrder.current = true;
      setLoadError(null);
      setStaleError(false);
      return true;
    } catch (e) {
      // First load failed: show an error with retry. Later polls keep the last copy.
      if (hasOrder.current) setStaleError(true);
      else setLoadError(getErrorMessage(e, 'Could not load this order.'));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [route.params.orderId]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  // Poll only while the order can still change, the screen is visible and the app is open.
  useFocusedPolling(() => fetchOrder(), POLL_INTERVAL_MS, order == null || isOpenOrder(order));

  const handleCancel = useCallback(() => {
    if (!order) return;
    Alert.alert('Cancel this order?', 'Items go back on the shelf and nothing is charged.', [
      { text: 'Keep order', style: 'cancel' },
      {
        text: 'Cancel order',
        style: 'destructive',
        onPress: async () => {
          setIsCancelling(true);
          try {
            const cancelled = await orderService.cancelOrder(order.id);
            setOrder(cancelled);
            await clearDeliveryCode(order.id);
            setDeliveryCode(null);
          } catch (e) {
            if (e instanceof ApiError && e.code === 'order_not_cancellable') {
              await fetchOrder();
              Alert.alert('Too late to cancel', 'A rider has already picked up your order.');
            } else {
              Alert.alert('Could not cancel', getErrorMessage(e));
            }
          } finally {
            setIsCancelling(false);
          }
        },
      },
    ]);
  }, [fetchOrder, order]);

  const handleBuyAgain = useCallback(async () => {
    if (!order) return;
    setIsReordering(true);
    try {
      const result = await reorderItems(order.items);
      if (result.added > 0 && result.unavailable.length > 0) {
        Alert.alert('Added available items', `${result.added} item${result.added === 1 ? '' : 's'} added. Unavailable: ${result.unavailable.join(', ')}`);
      } else if (result.added > 0) {
        Alert.alert('Added to cart', 'Current prices and availability were checked.');
      } else {
        Alert.alert('Nothing added', result.unavailable.length ? `Unavailable: ${result.unavailable.join(', ')}` : 'These items are not available right now.');
      }
    } catch (e) {
      Alert.alert('Could not buy again', getErrorMessage(e));
    } finally {
      setIsReordering(false);
    }
  }, [order, reorderItems]);

  const header = (
    <View style={styles.header}>
      <PressableScale onPress={() => navigation.goBack()} scaleTo={0.9} haptic="none" accessibilityRole="button" accessibilityLabel="Go back" style={styles.backButton}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </PressableScale>
      <View style={styles.titleBlock}>
        <AppText variant="heading2">{order ? `Order #${order.id.slice(0, 8)}` : 'Order'}</AppText>
        {order ? (
          <AppText variant="caption" color="textTertiary">
            {new Date(order.created_at).toLocaleString()}
          </AppText>
        ) : null}
      </View>
    </View>
  );

  if (!order) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        {header}
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : (
          <ErrorState
            title="Couldn’t load this order"
            message={loadError ?? undefined}
            onRetry={() => {
              setIsLoading(true);
              void fetchOrder();
            }}
            style={styles.loader}
          />
        )}
      </SafeAreaView>
    );
  }

  const look = statusLook(order.status);
  const open = isOpenOrder(order);
  const events = order.events ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      {header}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {staleError ? (
          <View style={styles.stale}>
            <Ionicons name="cloud-offline-outline" size={15} color={colors.warning} />
            <AppText variant="caption" style={styles.staleText}>
              Couldn’t refresh just now — showing the last update.
            </AppText>
          </View>
        ) : null}

        <View style={[styles.statusCard, { backgroundColor: look.soft, borderColor: look.color }]}>
          <AppText variant="captionStrong" style={{ color: look.color }}>
            {look.label.toUpperCase()}
          </AppText>
          <AppText variant="heading3" style={styles.statusValue}>
            {look.headline}
          </AppText>
          {order.status === 'cancelled' ? (
            <AppText variant="caption" color="textSecondary">
              {whoCancelled(order.cancelled_by_role)}
              {order.cancel_reason ? ` — ${order.cancel_reason}` : ''}
            </AppText>
          ) : (
            <AppText variant="caption" color="textSecondary">
              Pay {order.payment_method.toUpperCase()} · {order.payment_status === 'paid' ? 'paid' : 'on delivery'}
              {order.store_name ? ` · from ${order.store_name}` : ''}
            </AppText>
          )}
        </View>

        {open && deliveryCode ? (
          <View style={styles.codeCard}>
            <Ionicons name="key-outline" size={20} color={colors.primary} />
            <View style={styles.flex}>
              <AppText variant="caption" color="textSecondary">
                Delivery code — tell it to your rider at the door
              </AppText>
              <AppText variant="heading2" style={styles.code}>
                {deliveryCode.split('').join(' ')}
              </AppText>
            </View>
          </View>
        ) : null}

        {order.rider ? (
          <PressableScale
            onPress={() => void Linking.openURL(`tel:${order.rider?.phone}`)}
            scaleTo={0.985}
            haptic="none"
            accessibilityRole="button"
            accessibilityLabel="Call your rider"
            style={styles.riderCard}
          >
            <Ionicons name="bicycle" size={20} color={colors.primary} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{order.rider.name ?? 'Your rider'}</AppText>
              <AppText variant="caption" color="textSecondary">{order.rider.phone}</AppText>
            </View>
            <Ionicons name="call-outline" size={20} color={colors.primary} />
          </PressableScale>
        ) : null}

        {events.length > 0 ? (
          <>
            <AppText variant="heading3" style={styles.sectionHeader}>
              Order updates
            </AppText>
            <View style={styles.card}>
              {events.map((event, index) => {
                const eventLook = statusLook(event.status);
                return (
                  <View key={`${event.status}-${event.created_at}-${index}`} style={styles.eventRow}>
                    <View style={styles.eventRail}>
                      <View style={[styles.eventDot, { backgroundColor: eventLook.color }]} />
                      {index < events.length - 1 ? <View style={styles.eventLine} /> : null}
                    </View>
                    <View style={styles.flex}>
                      <AppText variant="bodySmall" style={styles.eventTitle}>
                        {event.note || eventLook.label}
                      </AppText>
                      <AppText variant="caption" color="textTertiary">
                        {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </AppText>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        <AppText variant="heading3" style={styles.sectionHeader}>
          Delivering to
        </AppText>
        <View style={styles.card}>
          <AppText variant="bodySmall" style={styles.lines}>
            {order.recipient_name} · {order.delivery_phone}
          </AppText>
          <AppText variant="bodySmall" color="textSecondary" style={styles.lines}>
            {[order.address_line1, order.address_line2, order.landmark].filter(Boolean).join(', ')}
          </AppText>
          <AppText variant="bodySmall" color="textSecondary" style={styles.lines}>
            {order.city}, {order.state} · {order.pincode}
          </AppText>
        </View>

        <AppText variant="heading3" style={styles.sectionHeader}>
          Items
        </AppText>
        <View style={styles.card}>
          {order.items.map((item) => (
            <View key={item.product_id} style={styles.itemRow}>
              <View style={styles.flex}>
                <AppText variant="bodySmall" style={styles.lines}>
                  {item.product_name}
                </AppText>
                <AppText variant="caption" color="textTertiary">
                  {formatPrice(item.unit_price)} × {item.quantity}
                </AppText>
              </View>
              <AppText variant="bodyStrong">{formatPrice(item.line_total)}</AppText>
            </View>
          ))}
          <View style={styles.divider} />
          <FeeRow label="Item total" value={formatPrice(order.subtotal_amount)} />
          <FeeRow label="Delivery fee" value={order.delivery_fee === 0 ? 'FREE' : formatPrice(order.delivery_fee)} />
          <FeeRow label="Handling charge" value={formatPrice(order.handling_fee)} />
          <View style={styles.divider} />
          <View style={styles.itemRow}>
            <AppText variant="bodyStrong">{order.status === 'completed' ? 'Paid' : 'To pay'}</AppText>
            <AppText variant="bodyStrong">{formatPrice(order.total_amount)}</AppText>
          </View>
        </View>

        {order.status === 'pending' ? (
          <Button label="Cancel order" onPress={handleCancel} loading={isCancelling} variant="danger" style={styles.cancelButton} />
        ) : null}
        {order.status === 'completed' || order.status === 'cancelled' ? (
          <Button label="Buy again" onPress={() => void handleBuyAgain()} loading={isReordering} style={styles.buyAgainButton} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function FeeRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.itemRow}>
      <AppText variant="bodySmall" color="textSecondary">{label}</AppText>
      <AppText variant="bodySmall">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.gutter, paddingVertical: spacing.lg },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  titleBlock: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xxxl },
  stale: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft, marginBottom: spacing.md },
  staleText: { marginLeft: spacing.sm, flex: 1 },
  statusCard: { padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.lg },
  statusValue: { marginTop: spacing.xs, marginBottom: spacing.xs },
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  code: { marginTop: spacing.xs, letterSpacing: 4 },
  riderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  sectionHeader: { marginTop: spacing.lg, marginBottom: spacing.sm },
  card: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  lines: { marginTop: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  flex: { flex: 1, marginRight: spacing.md },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  eventRow: { flexDirection: 'row', minHeight: 44 },
  eventRail: { width: 18, alignItems: 'center', marginRight: spacing.md },
  eventDot: { width: 10, height: 10, borderRadius: radius.pill, marginTop: 5 },
  eventLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  eventTitle: { fontFamily: fontFamilies.semiBold },
  cancelButton: { marginTop: spacing.xl },
  buyAgainButton: { marginTop: spacing.md, marginBottom: spacing.xxl },
});
