import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AppText, EmptyState, ErrorState, PressableScale } from '../../components';
import * as orderService from '../../services/orderService';
import { Order } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { statusLook } from '../../utils/orderStatus';
import { formatPrice } from '../../utils/price';
import { colors, layout, radius, spacing } from '../../theme';
import type { MainStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<MainStackParamList>;

export function OrderListScreen() {
  const navigation = useNavigation<Navigation>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  // First page. Refocusing refreshes quietly in the background: the list the user
  // is looking at never disappears behind a spinner.
  const load = useCallback(async (mode: 'initial' | 'silent' | 'pull') => {
    if (mode === 'initial' && !loaded.current) setIsLoading(true);
    if (mode === 'pull') setIsRefreshing(true);
    try {
      const page = await orderService.listOrders();
      setOrders(page.orders);
      setNextBefore(page.next_before ?? null);
      setError(null);
      loaded.current = true;
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load your orders.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextBefore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await orderService.listOrders(nextBefore);
      setOrders((current) => [...current, ...page.orders.filter((o) => !current.some((c) => c.id === o.id))]);
      setNextBefore(page.next_before ?? null);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load more orders.'));
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextBefore]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => void load('initial'));
    return unsub;
  }, [load, navigation]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <PressableScale onPress={() => navigation.goBack()} scaleTo={0.9} haptic="none" accessibilityRole="button" accessibilityLabel="Go back" style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </PressableScale>
        <AppText variant="heading2" style={styles.title}>
          My orders
        </AppText>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error && orders.length === 0 ? (
        <ErrorState message={error} onRetry={() => void load('initial')} style={styles.errorWrap} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load('pull')} tintColor={colors.primary} />}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            error ? (
              <View style={styles.banner}>
                <Ionicons name="cloud-offline-outline" size={15} color={colors.warning} />
                <AppText variant="caption" style={styles.bannerText}>
                  {error}
                </AppText>
                <PressableScale onPress={() => void load('pull')} scaleTo={0.95} haptic="none" accessibilityRole="button">
                  <AppText variant="captionStrong" color="primary">Retry</AppText>
                </PressableScale>
              </View>
            ) : null
          }
          ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.primary} style={styles.footer} /> : null}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="No orders yet"
              message="Place your first order to see it here."
              actionLabel="Start shopping"
              onActionPress={() => navigation.navigate('Tabs', { screen: 'Home' })}
            />
          }
          renderItem={({ item }) => {
            const look = statusLook(item.status);
            return (
              <PressableScale
                onPress={() => navigation.navigate('OrderDetails', { orderId: item.id })}
                scaleTo={0.985}
                haptic="none"
                accessibilityRole="button"
                style={styles.card}
              >
                <View style={styles.cardHeader}>
                  <AppText variant="bodyStrong">Order #{item.id.slice(0, 8)}</AppText>
                  <View style={[styles.statusPill, { backgroundColor: look.soft }]}>
                    <AppText variant="captionStrong" style={{ color: look.color }}>
                      {look.label}
                    </AppText>
                  </View>
                </View>
                <AppText variant="bodySmall" color="textSecondary" style={styles.sub}>
                  {item.items.length} item{item.items.length === 1 ? '' : 's'} · {formatPrice(item.total_amount)}
                  {item.store_name ? ` · ${item.store_name}` : ''}
                </AppText>
                <AppText variant="caption" color="textTertiary" style={styles.sub}>
                  {new Date(item.created_at).toLocaleString()}
                </AppText>
              </PressableScale>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  errorWrap: { flex: 1 },
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
  title: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xxl, flexGrow: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, marginBottom: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  bannerText: { flex: 1, marginHorizontal: spacing.sm },
  footer: { paddingVertical: spacing.lg },
  card: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill },
  sub: { marginTop: 2 },
});
