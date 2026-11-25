import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Animated, { LinearTransition } from 'react-native-reanimated';
import {
  AppText,
  Button,
  CartItemRow,
  CartSummary,
  EmptyState,
  ErrorState,
  PressableScale,
} from '../../components';
import { useAddresses } from '../../context/AddressContext';
import { useCart } from '../../context/CartContext';
import * as orderService from '../../services/orderService';
import { saveDeliveryCode, storage, StorageKeys } from '../../services/storage';
import { ApiError } from '../../services/apiClient';
import { getErrorMessage } from '../../utils/errors';
import { CartIssue, CartLine } from '../../types';
import { pluralize } from '../../utils/format';
import { formatPrice } from '../../utils/price';
import { colors, fontFamilies, layout, radius, shadows, spacing } from '../../theme';
import type { MainStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<MainStackParamList>;

function FreeDeliveryBar({ subtotal, remaining, threshold }: { subtotal: number; remaining: number; threshold: number }) {
  const progress = threshold > 0 ? Math.min(subtotal / threshold, 1) : 1;
  const unlocked = remaining === 0;

  return (
    <View style={[styles.deliveryCard, unlocked && styles.deliveryCardUnlocked]}>
      <View style={styles.deliveryCopy}>
        <Ionicons
          name={unlocked ? 'checkmark-circle' : 'bicycle'}
          size={17}
          color={unlocked ? colors.success : colors.primary}
        />
        <AppText variant="bodySmall" style={styles.deliveryText}>
          {unlocked
            ? 'Free delivery unlocked on this order'
            : `Add ${formatPrice(remaining)} more for free delivery`}
        </AppText>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.trackFill,
            {
              width: `${progress * 100}%`,
              backgroundColor: unlocked ? colors.success : colors.primary,
            },
          ]}
        />
      </View>
    </View>
  );
}

/** Unique enough per checkout attempt; the server only needs it to be stable across retries. */
function newCheckoutKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function CartScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { cart, items, totals, issues, canCheckout, error, isHydrated, isMutating, clearCart, refresh, setLineQuantity, removeLine } = useCart();
  const { defaultAddress, refresh: refreshAddresses } = useAddresses();
  const [isPlacing, setIsPlacing] = useState(false);
  // A ref, not state: two taps in the same frame must not both get through.
  const placingRef = useRef(false);
  // Reused across retries of one checkout so a timeout can never create two orders.
  const checkoutKey = useRef<string | null>(null);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      void refreshAddresses();
      void refresh();
    });
    return unsub;
  }, [navigation, refresh, refreshAddresses]);

  const goToHome = useCallback(
    () => navigation.navigate('Tabs', { screen: 'Home' }),
    [navigation],
  );

  // Select mode: tapping an address makes it the delivery address and returns here.
  const goToAddresses = useCallback(
    () => navigation.navigate('AddressList', { selectMode: true }),
    [navigation],
  );

  const handleClear = useCallback(() => {
    Alert.alert('Empty your cart?', 'This removes every item you have added.', [
      { text: 'Keep items', style: 'cancel' },
      { text: 'Empty cart', style: 'destructive', onPress: () => void clearCart() },
    ]);
  }, [clearCart]);

  const issueByItem = useMemo(() => {
    const map = new Map<string, CartIssue>();
    issues.forEach((issue) => {
      if (issue.item_id) map.set(issue.item_id, issue);
    });
    return map;
  }, [issues]);
  const cartLevelIssues = useMemo(() => issues.filter((issue) => !issue.item_id), [issues]);

  const handleCheckout = useCallback(async () => {
    if (placingRef.current) return;
    if (!defaultAddress) {
      Alert.alert('Add a delivery address', 'Please add an address before placing an order.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add address', onPress: () => navigation.navigate('AddressForm', { selectMode: true }) },
      ]);
      return;
    }
    Alert.alert('Place COD order?', `You will pay ${formatPrice(totals.total)} in cash after delivery.`, [
      { text: 'Review again', style: 'cancel' },
      { text: 'Place order', onPress: () => void submitOrder() },
    ]);
  }, [defaultAddress, navigation, totals.total]);

  const submitOrder = useCallback(async () => {
    if (placingRef.current || !defaultAddress) return;
    placingRef.current = true;
    setIsPlacing(true);
    if (!checkoutKey.current) {
      checkoutKey.current = (await storage.get<string>(StorageKeys.checkoutIdempotencyKey)) ?? newCheckoutKey();
      await storage.set(StorageKeys.checkoutIdempotencyKey, checkoutKey.current);
    }
    try {
      const order = await orderService.createOrder(defaultAddress.id, checkoutKey.current);
      checkoutKey.current = null;
      await storage.remove(StorageKeys.checkoutIdempotencyKey);
      if (order.delivery_code) await saveDeliveryCode(order.id, order.delivery_code);
      await refresh();
      navigation.navigate('OrderDetails', { orderId: order.id });
    } catch (e) {
      // 0 = we never heard back, 5xx = the server may or may not have finished. In both
      // cases the next tap reuses the same key, so it returns the order if it exists.
      const outcomeUnknown = e instanceof ApiError && (e.status === 0 || e.status >= 500);
      if (outcomeUnknown) {
        Alert.alert(
          'We couldn’t confirm your order',
          'Your connection dropped while placing it. Tap “Place order” again — we’ll make sure you’re not charged twice.',
        );
        return;
      }
      checkoutKey.current = null;
      await storage.remove(StorageKeys.checkoutIdempotencyKey);
      if (e instanceof ApiError && e.code === 'not_serviceable') {
        void refresh();
        Alert.alert('We can’t deliver there', e.message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Change address', onPress: goToAddresses },
        ]);
      } else if (e instanceof ApiError && e.code === 'cart_unavailable') {
        void refresh();
        Alert.alert('Your cart changed', `${e.message}. We’ve updated your cart — please review it.`);
      } else if (e instanceof ApiError && e.code === 'rate_limited') {
        Alert.alert('Slow down a little', e.message);
      } else {
        Alert.alert('Could not place order', getErrorMessage(e));
      }
    } finally {
      placingRef.current = false;
      setIsPlacing(false);
    }
  }, [defaultAddress, goToAddresses, navigation, refresh]);

  const fixLine = useCallback(
    (line: CartLine, issue: CartIssue) => {
      if (issue.code === 'insufficient_stock' && (issue.available_quantity ?? 0) > 0) {
        void setLineQuantity(line, issue.available_quantity as number);
      } else {
        void removeLine(line);
      }
    },
    [removeLine, setLineQuantity],
  );

  const renderItem = useCallback(
    ({ item }: { item: CartLine }) => {
      const issue = issueByItem.get(item.id);
      return <CartItemRow line={item} issue={issue} onFix={issue ? () => fixLine(item, issue) : undefined} />;
    },
    [fixLine, issueByItem],
  );

  if (!cart) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <AppText variant="heading1">Your cart</AppText>
        </View>
        {error ? (
          <ErrorState message={error} onRetry={() => void refresh()} style={styles.centerFill} />
        ) : (
          <View style={styles.centerFill}>{isHydrated ? null : <ActivityIndicator color={colors.primary} />}</View>
        )}
      </SafeAreaView>
    );
  }

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <AppText variant="heading1">Your cart</AppText>
        </View>

        <View style={styles.emptyWrap}>
          <EmptyState
            icon="cart-outline"
            title="Your cart is empty"
            message="Add some essentials and we'll have them at your door in minutes."
            actionLabel="Start shopping"
            onActionPress={goToHome}
          />
        </View>
      </SafeAreaView>
    );
  }

  const noAddress = defaultAddress == null;
  const blocked = !noAddress && !canCheckout;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AppText variant="heading1">Your cart</AppText>
          <AppText variant="bodySmall" color="textSecondary" style={styles.headerSub}>
            {pluralize(totals.itemCount, 'item')}
            {cart?.store_name ? ` · from ${cart.store_name}` : ''} · arriving in 10 mins
          </AppText>
        </View>

        <PressableScale
          onPress={handleClear}
          scaleTo={0.94}
          haptic="none"
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Empty cart"
          style={styles.clearButton}
        >
          <Ionicons name="trash-outline" size={16} color={colors.error} />
          <AppText variant="captionStrong" color="error" style={styles.clearLabel}>
            Empty
          </AppText>
        </PressableScale>
      </View>

      <Animated.FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: 72 + Math.max(insets.bottom, spacing.md) }]}
        ListHeaderComponent={
          <View>
            {error ? (
              <View style={styles.banner}>
                <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
                <AppText variant="bodySmall" style={styles.bannerText}>
                  Couldn’t refresh your cart.
                </AppText>
                <PressableScale onPress={() => void refresh()} scaleTo={0.95} haptic="none" accessibilityRole="button">
                  <AppText variant="captionStrong" color="primary">Retry</AppText>
                </PressableScale>
              </View>
            ) : null}
            {cartLevelIssues.map((issue) => (
              <View key={issue.code} style={[styles.banner, styles.bannerError]}>
                <Ionicons name={issue.code === 'not_serviceable' ? 'location-outline' : 'alert-circle-outline'} size={16} color={colors.error} />
                <AppText variant="bodySmall" style={styles.bannerText}>
                  {issue.message}
                </AppText>
                {issue.code === 'not_serviceable' ? (
                  <PressableScale onPress={goToAddresses} scaleTo={0.95} haptic="none" accessibilityRole="button">
                    <AppText variant="captionStrong" color="primary">Change</AppText>
                  </PressableScale>
                ) : null}
              </View>
            ))}
            <FreeDeliveryBar subtotal={totals.subtotal} remaining={totals.amountToFreeDelivery} threshold={totals.freeDeliveryThreshold} />
          </View>
        }
        ItemSeparatorComponent={ItemSeparator}
        ListFooterComponent={
          <View style={styles.footerBlock}>
            <CartSummary totals={totals} />

            <PressableScale onPress={goToAddresses} scaleTo={0.985} haptic="none" style={styles.addressCard}>
              <Ionicons name="location-outline" size={18} color={colors.primary} />
              <View style={styles.addressCopy}>
                <AppText variant="captionStrong">Delivering to</AppText>
                <AppText variant="bodySmall" color="textSecondary" numberOfLines={2}>
                  {defaultAddress
                    ? `${defaultAddress.label} · ${defaultAddress.address_line1}, ${defaultAddress.city} ${defaultAddress.pincode}`
                    : 'Add a delivery address to continue'}
                </AppText>
              </View>
              <AppText variant="button" color="primary">
                Change
              </AppText>
            </PressableScale>
          </View>
        }
        itemLayoutAnimation={LinearTransition.duration(220)}
      />

      <View style={[styles.checkoutBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.checkoutTotal}>
          <AppText variant="caption" color="textTertiary">
            To pay
          </AppText>
          <AppText variant="heading3">{formatPrice(totals.total)}</AppText>
        </View>

        <Button
          label={noAddress ? 'Add delivery address' : blocked ? 'Fix cart to continue' : 'Place order'}
          onPress={noAddress ? goToAddresses : handleCheckout}
          loading={isPlacing}
          disabled={isMutating || blocked}
          icon={noAddress || blocked ? undefined : 'arrow-forward'}
          iconPosition="right"
          fullWidth={false}
          style={styles.checkoutButton}
          accessibilityHint={noAddress ? 'Opens address selection' : 'Places the order with cash on delivery'}
        />
      </View>
    </SafeAreaView>
  );
}

const ItemSeparator = () => <View style={styles.itemSeparator} />;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
  },
  headerCopy: { flex: 1 },
  headerSub: { marginTop: spacing.xs },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.errorSoft,
  },
  clearLabel: { marginLeft: spacing.xs },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: layout.gutter,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  bannerError: { backgroundColor: colors.errorSoft },
  bannerText: { flex: 1, marginHorizontal: spacing.sm },
  emptyWrap: { flex: 1, backgroundColor: colors.background, justifyContent: 'center' },
  listContent: { paddingTop: spacing.lg },
  itemSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 84 },
  deliveryCard: {
    marginHorizontal: layout.gutter,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  deliveryCardUnlocked: { backgroundColor: colors.successSoft, borderColor: 'rgba(18,160,92,0.25)' },
  deliveryCopy: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  deliveryText: { marginLeft: spacing.sm, flex: 1, fontFamily: fontFamilies.semiBold },
  track: { height: 5, borderRadius: radius.pill, backgroundColor: 'rgba(16,18,25,0.08)', overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: radius.pill },
  footerBlock: { paddingHorizontal: layout.gutter, paddingTop: spacing.lg },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressCopy: { flex: 1, marginHorizontal: spacing.md },
  checkoutBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.md,
    ...shadows.floating,
  },
  checkoutTotal: { flex: 1 },
  checkoutButton: { paddingHorizontal: spacing.xl },
});
