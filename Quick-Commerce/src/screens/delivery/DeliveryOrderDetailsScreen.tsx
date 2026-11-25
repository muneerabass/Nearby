import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, DeliveryCodeSheet, InlineBanner, PressableScale } from '../../components';
import { useFocusedPolling } from '../../hooks/useFocusedPolling';
import { ApiError } from '../../services/apiClient';
import { getErrorMessage } from '../../utils/errors';
import * as deliveryService from '../../services/deliveryService';
import { useDelivery } from '../../context/DeliveryContext';
import { Order } from '../../types';
import { formatPrice } from '../../utils/price';
import { colors, layout, radius, spacing } from '../../theme';
import type { DeliveryStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DeliveryStackParamList, 'DeliveryOrderDetails'>;

export function DeliveryOrderDetailsScreen({ navigation, route }: Props) {
  const { accept, complete, pickup, outForDelivery, hasActiveOrder, isBusy } = useDelivery();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [stale, setStale] = useState(false);
  const [showCodeSheet, setShowCodeSheet] = useState(false);
  const hasOrder = useRef(false);

  const load = useCallback(async (): Promise<boolean> => {
    try {
      const next = await deliveryService.getDeliveryOrder(route.params.orderId);
      setOrder(next);
      hasOrder.current = true;
      setLoadError(null);
      setStale(false);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // Taken by another rider, or cancelled while we were looking.
        setOrder(null);
        setUnavailable(true);
        setLoadError('This order is no longer available. Another rider may have taken it, or the customer cancelled.');
      } else if (hasOrder.current) {
        setStale(true);
      } else {
        setLoadError(getErrorMessage(e, 'Could not load order.'));
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [route.params.orderId]);

  // Keep the order fresh while the rider looks at it: it may be taken or cancelled.
  const live = !unavailable && (order == null || order.status === 'pending' || order.status === 'accepted' || order.status === 'picked_up' || order.status === 'out_for_delivery');
  useFocusedPolling(() => load(), 8_000, live);

  const handleAccept = useCallback(async () => {
    const result = await accept(route.params.orderId);
    if (result.ok) {
      await load();
    } else {
      Alert.alert('Could not accept', result.message ?? 'Try again.');
      await load();
    }
  }, [accept, load, route.params.orderId]);

  // Returns an inline error for the sheet, or null once delivered.
  const submitCode = useCallback(
    async (code: string): Promise<string | null> => {
      const result = await complete(route.params.orderId, code);
      if (result.ok) {
        await load();
        return null;
      }
      if (result.code === 'delivery_code_locked') {
        setShowCodeSheet(false);
        Alert.alert('Too many wrong codes', result.message ?? 'Ask support to complete this order.');
        return null;
      }
      return result.message ?? 'Could not complete this order.';
    },
    [complete, load, route.params.orderId],
  );

  const transition = useCallback(async (action: () => Promise<{ ok: boolean; message?: string }>, label: string) => {
    const result = await action();
    if (!result.ok) Alert.alert(`Could not ${label}`, result.message ?? 'Try again.'); else await load();
  }, [load]);

  const openMaps = useCallback(() => {
    if (!order) return;
    const query = order.latitude != null && order.longitude != null
      ? `${order.latitude},${order.longitude}`
      : encodeURIComponent(`${order.address_line1}, ${order.city}, ${order.state} ${order.pincode}`);
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    void Linking.openURL(url);
  }, [order]);

  const callCustomer = useCallback(() => {
    if (!order) return;
    void Linking.openURL(`tel:${order.delivery_phone}`);
  }, [order]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </SafeAreaView>
    );
  }

  if (loadError || !order) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <PressableScale onPress={() => navigation.goBack()} scaleTo={0.9} haptic="none" style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </PressableScale>
          <View style={styles.titleBlock}>
            <AppText variant="heading2">Order unavailable</AppText>
          </View>
        </View>
        <View style={styles.errorBlock}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.textTertiary} />
          <AppText variant="bodyStrong" style={styles.errorTitle}>
            Could not load this order
          </AppText>
          <AppText variant="bodySmall" color="textSecondary" style={styles.errorMessage}>
            {loadError ?? 'The order may have been accepted by another rider or completed already.'}
          </AppText>
          <Button label="Try again" onPress={() => { setIsLoading(true); void load(); }} style={styles.errorButton} />
          <Button label="Back" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const isMutating = isBusy(order.id);
  const canAccept = order.status === 'pending';
  const canPickup = order.status === 'accepted';
  const canOutForDelivery = order.status === 'picked_up';
  const canComplete = order.status === 'out_for_delivery';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <PressableScale onPress={() => navigation.goBack()} scaleTo={0.9} haptic="none" style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </PressableScale>
        <View style={styles.titleBlock}>
          <AppText variant="heading2">Order #{order.id.slice(0, 8)}</AppText>
          <AppText variant="caption" color="textTertiary">
            {order.status.toUpperCase()} · {new Date(order.created_at).toLocaleString()}
          </AppText>
        </View>
      </View>

      {stale ? <InlineBanner message="Couldn’t refresh — showing the last update." actionLabel="Retry" onActionPress={() => void load()} /> : null}

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <AppText variant="captionStrong" color="textTertiary">
            CUSTOMER
          </AppText>
          <AppText variant="bodyStrong" style={styles.lines}>
            {order.recipient_name}
          </AppText>
          <AppText variant="bodySmall" color="textSecondary" style={styles.lines}>
            {order.delivery_phone}
          </AppText>
          <View style={styles.actions}>
            <Button label="Call" variant="secondary" size="sm" icon="call-outline" onPress={callCustomer} style={styles.actionBtn} />
            <Button label="Navigate" variant="secondary" size="sm" icon="navigate-outline" onPress={openMaps} style={styles.actionBtn} />
          </View>
        </View>

        <AppText variant="heading3" style={styles.sectionHeader}>
          Deliver to
        </AppText>
        <View style={styles.card}>
          <AppText variant="bodySmall" style={styles.lines}>
            {[order.address_line1, order.address_line2, order.landmark].filter(Boolean).join(', ')}
          </AppText>
          <AppText variant="bodySmall" color="textSecondary" style={styles.lines}>
            {order.city}, {order.state} · {order.pincode}
          </AppText>
          {order.delivery_instructions ? (
            <AppText variant="caption" color="textTertiary" style={styles.lines}>
              Note: {order.delivery_instructions}
            </AppText>
          ) : null}
        </View>

        <AppText variant="heading3" style={styles.sectionHeader}>
          Pickup
        </AppText>
        <View style={styles.card}>
          {order.items.map((item) => (
            <View key={item.product_id} style={styles.itemRow}>
              <View style={styles.flex}>
                <AppText variant="bodySmall" style={styles.lines}>
                  {item.product_name}
                </AppText>
                <AppText variant="caption" color="textTertiary">
                  × {item.quantity}
                </AppText>
              </View>
              <AppText variant="bodyStrong">{formatPrice(item.line_total)}</AppText>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.itemRow}>
            <AppText variant="bodyStrong">Collect on delivery</AppText>
            <AppText variant="bodyStrong" color="primary">
              {formatPrice(order.status === 'completed' ? order.total_amount : order.amount_to_collect)}
            </AppText>
          </View>
        </View>

        {canAccept ? (
          <>
            {hasActiveOrder ? (
              <AppText variant="bodySmall" color="textSecondary" style={styles.busyNote}>
                Finish your current delivery before accepting another order.
              </AppText>
            ) : null}
            <Button
              label={hasActiveOrder ? 'Busy with a delivery' : 'Accept order'}
              onPress={handleAccept}
              loading={isMutating}
              disabled={hasActiveOrder}
              style={styles.ctaButton}
            />
          </>
        ) : null}
        {canComplete ? (
          <Button label="Mark delivered" onPress={() => setShowCodeSheet(true)} loading={isMutating} style={styles.ctaButton} />
        ) : null}
        {canPickup ? <Button label="Confirm pickup" onPress={() => void transition(() => pickup(order.id), 'confirm pickup')} loading={isMutating} style={styles.ctaButton} /> : null}
        {canOutForDelivery ? <Button label="Start delivery" onPress={() => void transition(() => outForDelivery(order.id), 'start delivery')} loading={isMutating} style={styles.ctaButton} /> : null}
        {order.status === 'completed' ? (
          <View style={styles.doneCard}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <AppText variant="bodyStrong" color="success" style={styles.doneLabel}>
              Delivered — {order.completed_at ? new Date(order.completed_at).toLocaleTimeString() : ''}
            </AppText>
          </View>
        ) : null}
      </ScrollView>

      <DeliveryCodeSheet
        visible={showCodeSheet}
        amountToCollect={order.amount_to_collect}
        onClose={() => setShowCodeSheet(false)}
        onSubmit={submitCode}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { flex: 1 },
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
  card: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  lines: { marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { flex: 1 },
  sectionHeader: { marginTop: spacing.lg, marginBottom: spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  flex: { flex: 1, marginRight: spacing.md },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  busyNote: { marginTop: spacing.lg },
  ctaButton: { marginTop: spacing.lg },
  doneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
  },
  doneLabel: { marginLeft: spacing.sm },
  errorBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: layout.gutter },
  errorTitle: { marginTop: spacing.md },
  errorMessage: { marginTop: spacing.sm, textAlign: 'center', maxWidth: 280 },
  errorButton: { marginTop: spacing.lg, alignSelf: 'stretch' },
});
