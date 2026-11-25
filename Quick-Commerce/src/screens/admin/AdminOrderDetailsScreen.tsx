import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, Button, ErrorState, OrderStatusChip, OrderTimeline, OrderTotalsBlock, PressableScale, ReasonSheet } from '../../components';
import { useFocusedPolling } from '../../hooks/useFocusedPolling';
import * as adminService from '../../services/adminService';
import { Order, User } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { isOpenOrder, minutesAgo, shortOrderId, staffHeadline, whoCancelledStaff } from '../../utils/orderStatus';
import { formatPrice } from '../../utils/price';
import { colors, layout, radius, spacing } from '../../theme';
import type { AdminStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminOrderDetails'>;

const CANCEL_REASONS = ['Customer unreachable', 'Rider unreachable', 'Store cannot fulfil', 'Cancelled by support'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <AppText variant="heading3" style={styles.section}>{title}</AppText>
      {children}
    </>
  );
}

function ContactRow({ icon, title, subtitle, phone }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string; phone?: string }) {
  return (
    <PressableScale
      onPress={() => phone && void Linking.openURL(`tel:${phone}`)}
      disabled={!phone}
      scaleTo={0.985}
      haptic="none"
      accessibilityRole="button"
      accessibilityLabel={phone ? `Call ${title}` : title}
      style={styles.contact}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? <AppText variant="caption" color="textSecondary">{subtitle}</AppText> : null}
      </View>
      {phone ? <Ionicons name="call-outline" size={20} color={colors.primary} /> : null}
    </PressableScale>
  );
}

export function AdminOrderDetailsScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pickingRider, setPickingRider] = useState(false);
  const [riders, setRiders] = useState<User[] | null>(null);
  const [ridersError, setRidersError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<boolean> => {
    try {
      setOrder(await adminService.getOrder(orderId));
      setError(null);
      return true;
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load this order.'));
      return false;
    }
  }, [orderId]);

  useFocusedPolling(() => load(), 10_000, !order || isOpenOrder(order));

  // Riders are only needed once the admin opens the assign sheet.
  useEffect(() => {
    if (!pickingRider || !order) return;
    setRiders(null);
    setRidersError(null);
    adminService.listDeliveryUsersForStore(order.store_id).then(setRiders).catch((e) => setRidersError(getErrorMessage(e, 'Could not load riders.')));
  }, [order?.store_id, pickingRider]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async (action: () => Promise<Order>, failureTitle: string) => {
    setBusy(true);
    try {
      setOrder(await action());
    } catch (e) {
      Alert.alert(failureTitle, getErrorMessage(e));
      await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  const reassign = useCallback(() => {
    Alert.alert('Reassign this order?', 'It goes back to the pending list for another rider to accept.', [
      { text: 'Keep rider', style: 'cancel' },
      { text: 'Reassign', onPress: () => void run(() => adminService.reassignOrder(orderId), 'Could not reassign') },
    ]);
  }, [orderId, run]);

  const resetCode = useCallback(() => {
    Alert.alert('Reset delivery code attempts?', 'The rider can try the customer’s code again. This is recorded in the order history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', onPress: () => void run(() => adminService.resetDeliveryCode(orderId), 'Could not reset') },
    ]);
  }, [orderId, run]);

  const open = order ? isOpenOrder(order) : false;
  const codeLocked = !!order && open && (order.delivery_code_attempts ?? 0) > 0;
  const address = order ? [order.address_line1, order.address_line2, order.landmark].filter(Boolean).join(', ') : '';

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
            <AppText variant="caption" color="textTertiary" style={styles.meta}>
              {order.store_name ?? 'Store'} · placed {minutesAgo(order.created_at)}
              {order.completed_at ? ` · delivered ${minutesAgo(order.completed_at)}` : ''}
            </AppText>
          </View>

          {(order.rider_rejections ?? 0) > 0 ? (
            <View style={styles.warn}>
              <Ionicons name="hand-left-outline" size={18} color={colors.warning} />
              <AppText variant="bodySmall" style={styles.flex}>Rejected by {order.rider_rejections} rider{order.rider_rejections === 1 ? '' : 's'}. Reasons are in the history below.</AppText>
            </View>
          ) : null}
          {codeLocked ? (
            <View style={[styles.warn, { backgroundColor: colors.errorSoft }]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.error} />
              <AppText variant="bodySmall" style={styles.flex}>{order.delivery_code_attempts} wrong delivery code attempt{order.delivery_code_attempts === 1 ? '' : 's'}.</AppText>
            </View>
          ) : null}

          <Section title="Customer">
            <ContactRow icon="person-outline" title={order.customer?.name || order.recipient_name} subtitle={order.customer?.phone ?? order.delivery_phone} phone={order.customer?.phone ?? order.delivery_phone} />
            <View style={[styles.card, styles.gap]}>
              <AppText variant="bodySmall">Deliver to {order.recipient_name} · {order.delivery_phone}</AppText>
              <AppText variant="bodySmall" color="textSecondary">{address}</AppText>
              <AppText variant="bodySmall" color="textSecondary">{order.city}, {order.state} · {order.pincode}</AppText>
              {order.delivery_instructions ? <AppText variant="caption" color="textTertiary">Note: {order.delivery_instructions}</AppText> : null}
            </View>
          </Section>

          <Section title="Rider">
            {order.rider ? (
              <ContactRow
                icon="bicycle"
                title={order.rider.name ?? 'Rider'}
                subtitle={`${order.rider.phone}${order.rider.is_online ? ' · online' : ' · offline'}${order.accepted_at ? ` · accepted ${minutesAgo(order.accepted_at)}` : ''}`}
                phone={order.rider.phone}
              />
            ) : (
              <View style={styles.card}><AppText variant="bodySmall" color="textSecondary">{order.status === 'pending' ? 'No rider has accepted this order yet.' : 'No rider was assigned.'}</AppText></View>
            )}
          </Section>

          <Section title="Items and payment">
            <OrderTotalsBlock order={order} />
            <View style={[styles.card, styles.gap]}>
              <AppText variant="bodySmall">Cash on delivery · {order.payment_status === 'paid' ? 'collected' : `to collect ${formatPrice(order.amount_to_collect || order.total_amount)}`}</AppText>
            </View>
          </Section>

          {order.events && order.events.length > 0 ? (
            <Section title="History">
              <OrderTimeline events={order.events} staff />
            </Section>
          ) : null}

          {open ? (
            <View style={styles.actions}>
              {order.status === 'pending' ? <Button label="Assign to a rider" icon="person-add-outline" variant="secondary" disabled={busy} onPress={() => setPickingRider(true)} /> : null}
              {order.status === 'accepted' ? <Button label="Reassign" icon="swap-horizontal-outline" variant="secondary" disabled={busy} onPress={reassign} /> : null}
              {codeLocked ? <Button label="Reset delivery code attempts" icon="refresh-outline" variant="secondary" disabled={busy} onPress={resetCode} /> : null}
              <Button label="Cancel order" variant="danger" disabled={busy} onPress={() => setCancelling(true)} />
            </View>
          ) : null}
        </ScrollView>
      )}

      <ReasonSheet
        visible={cancelling}
        title="Cancel this order?"
        message="The customer is notified in the app and the stock goes back on the shelf."
        confirmLabel="Cancel order"
        suggestions={CANCEL_REASONS}
        onClose={() => setCancelling(false)}
        onSubmit={async (reason) => {
          try {
            setOrder(await adminService.cancelOrder(orderId, reason));
            return null;
          } catch (e) {
            await load();
            return getErrorMessage(e, 'Could not cancel this order.');
          }
        }}
      />

      <Modal visible={pickingRider} transparent animationType="slide" onRequestClose={() => setPickingRider(false)} statusBarTranslucent>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setPickingRider(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.handle} />
            <AppText variant="heading2">Assign to a rider</AppText>
            <AppText variant="bodySmall" color="textSecondary" style={styles.sheetHint}>Only online riders assigned to this store can take the order.</AppText>
            {!riders && !ridersError ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
            {ridersError ? <AppText variant="bodySmall" color="error">{ridersError}</AppText> : null}
            {riders && riders.length === 0 ? <AppText variant="bodySmall" color="textSecondary">No riders are assigned to this store. Add riders from Settings → Delivery riders.</AppText> : null}
            {(riders ?? []).map((rider) => (
              <PressableScale
                key={rider.id}
                onPress={() => {
                  setPickingRider(false);
                  void run(() => adminService.assignOrder(orderId, rider.id), 'Could not assign');
                }}
                haptic="none"
                scaleTo={0.985}
                style={styles.riderRow}
              >
                <View style={[styles.dot, { backgroundColor: rider.is_online ? colors.success : colors.borderStrong }]} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{rider.name ?? rider.phone}</AppText>
                  <AppText variant="caption" color="textSecondary">{rider.is_online ? 'Online' : 'Offline'} · {rider.phone}</AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </PressableScale>
            ))}
          </View>
        </View>
      </Modal>
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
  meta: { marginTop: spacing.xs },
  warn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  section: { marginTop: spacing.xl, marginBottom: spacing.sm },
  contact: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  card: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  gap: { marginTop: spacing.sm },
  actions: { gap: spacing.md, marginTop: spacing.xl },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.xl, paddingTop: spacing.md, maxHeight: '80%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.borderStrong, marginBottom: spacing.lg },
  sheetHint: { marginTop: spacing.xs, marginBottom: spacing.md },
  loader: { marginVertical: spacing.lg },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
});
