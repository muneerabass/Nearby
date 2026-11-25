import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AppText, EmptyState, ErrorState, FilterChips, InlineBanner, Input, OrderStatusChip, PressableScale, Screen } from '../../components';
import { useAdmin } from '../../context/AdminContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useFocusedPolling } from '../../hooks/useFocusedPolling';
import * as adminService from '../../services/adminService';
import { AttentionOrder, AttentionReason, Order } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { attentionLabel, minutesAgo, shortOrderId, staffHeadline, whoCancelledStaff } from '../../utils/orderStatus';
import { formatPrice } from '../../utils/price';
import { colors, layout, radius, spacing } from '../../theme';
import type { AdminOrdersTab, AdminStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<AdminStackParamList>;
type Props = NativeStackScreenProps<AdminStackParamList, 'Orders'>;
type Scope = 'all' | 'store';

const OPEN_STATUSES = ['pending', 'accepted', 'picked_up', 'out_for_delivery'];
const HISTORY_STATUSES = ['completed', 'cancelled'];

interface Row {
  order: Order;
  reasons?: AttentionReason[];
}

export function AdminOrdersScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Props['route']>();
  const { activeStore } = useAdmin();
  const [tab, setTab] = useState<AdminOrdersTab>(route.params?.tab ?? 'open');
  const [scope, setScope] = useState<Scope>('all');
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search, 400);

  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMore, setIsMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attentionCount, setAttentionCount] = useState(0);
  // Drops answers that arrive after the user already switched tab, scope or search.
  const requestId = useRef(0);

  // Opening the screen from a dashboard tile switches the tab.
  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.tab]);

  const storeId = scope === 'store' ? activeStore?.id : undefined;

  const fetchPage = useCallback(
    async (before: string | null): Promise<{ rows: Row[]; next: string | null }> => {
      if (tab === 'attention') {
        const items: AttentionOrder[] = await adminService.listOrdersNeedingAttention(storeId);
        return { rows: items.map((item) => ({ order: item.order, reasons: item.reasons })), next: null };
      }
      const page = await adminService.listOrdersPage({
        status: tab === 'open' ? OPEN_STATUSES : tab === 'history' ? HISTORY_STATUSES : undefined,
        storeId,
        q: query,
        before,
        limit: tab === 'open' ? 100 : 30,
      });
      return { rows: page.orders.map((order) => ({ order })), next: page.next_before ?? null };
    },
    [query, storeId, tab],
  );

  const load = useCallback(
    async (mode: 'reset' | 'silent' | 'pull' = 'silent'): Promise<boolean> => {
      const id = ++requestId.current;
      if (mode === 'pull') setIsRefreshing(true);
      try {
        const page = await fetchPage(null);
        if (id !== requestId.current) return true;
        setRows(page.rows);
        setCursor(page.next);
        setError(null);
        if (tab === 'attention') setAttentionCount(page.rows.length);
        else adminService.listOrdersNeedingAttention(storeId).then((items) => setAttentionCount(items.length)).catch(() => undefined);
        return true;
      } catch (e) {
        if (id === requestId.current) setError(getErrorMessage(e, 'Could not load orders.'));
        return false;
      } finally {
        if (id === requestId.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [fetchPage, storeId, tab],
  );

  const loadMore = useCallback(async () => {
    if (!cursor || isMore || tab === 'attention') return;
    const id = requestId.current;
    setIsMore(true);
    try {
      const page = await fetchPage(cursor);
      if (id !== requestId.current) return;
      setRows((prev) => [...prev, ...page.rows]);
      setCursor(page.next);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load more orders.'));
    } finally {
      setIsMore(false);
    }
  }, [cursor, fetchPage, isMore, tab]);

  // Any change of tab, scope or search starts from a clean first page.
  useEffect(() => {
    setIsLoading(true);
    setRows([]);
    setCursor(null);
    void load('reset');
  }, [load]);

  // Only live queues keep polling; history is read on demand so paging is not disturbed.
  useFocusedPolling(() => load(), 20_000, tab === 'open' || tab === 'attention');

  const tabs = useMemo(
    () => [
      { key: 'open' as const, label: 'Open' },
      { key: 'attention' as const, label: 'Needs attention', count: attentionCount },
      { key: 'history' as const, label: 'History' },
      { key: 'all' as const, label: 'All' },
    ],
    [attentionCount],
  );

  const showSearch = tab !== 'attention';

  return (
    <Screen>
      <View style={styles.header}>
        <PressableScale onPress={() => navigation.goBack()} scaleTo={0.9} haptic="none" accessibilityRole="button" accessibilityLabel="Go back" style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </PressableScale>
        <AppText variant="heading2" style={styles.title}>Orders</AppText>
      </View>

      <FilterChips value={tab} onChange={setTab} options={tabs} />
      {activeStore ? (
        <FilterChips value={scope} onChange={setScope} options={[{ key: 'all', label: 'All stores' }, { key: 'store', label: activeStore.name }]} />
      ) : null}
      {showSearch ? (
        <View style={styles.search}>
          <Input value={search} onChangeText={setSearch} placeholder="Search order id, name or phone" leftIcon="search" autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error && rows.length === 0 ? (
        <ErrorState message={error} onRetry={() => void load('reset')} style={styles.center} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.order.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load('pull')} tintColor={colors.primary} />}
          ListHeaderComponent={error ? <InlineBanner message={error} actionLabel="Retry" onActionPress={() => void load('reset')} /> : null}
          ListEmptyComponent={
            <EmptyState
              icon={tab === 'attention' ? 'checkmark-done-outline' : 'receipt-outline'}
              title={tab === 'attention' ? 'Nothing needs attention' : query ? 'No matching orders' : 'No orders here'}
              message={tab === 'attention' ? 'Every open order is moving along.' : query ? 'Try a different name, phone or order id.' : 'Orders show up here as customers place them.'}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => void loadMore()}
          ListFooterComponent={isMore ? <ActivityIndicator color={colors.primary} style={styles.footer} /> : null}
          renderItem={({ item }) => <OrderRow row={item} onPress={() => navigation.navigate('AdminOrderDetails', { orderId: item.order.id })} />}
        />
      )}
    </Screen>
  );
}

function OrderRow({ row, onPress }: { row: Row; onPress: () => void }) {
  const { order } = row;
  const customer = order.customer?.name || order.recipient_name;
  const rider = order.rider?.name || order.rider?.phone;
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} haptic="none" accessibilityRole="button" accessibilityLabel={`Order ${shortOrderId(order.id)}`} style={styles.card}>
      <View style={styles.cardHeader}>
        <AppText variant="bodyStrong">{shortOrderId(order.id)}</AppText>
        <OrderStatusChip status={order.status} />
      </View>
      <AppText variant="bodySmall" color="textSecondary" style={styles.line}>
        {order.store_name ?? 'Store'} · {order.items.length} item{order.items.length === 1 ? '' : 's'} · {formatPrice(order.total_amount)}
      </AppText>
      <AppText variant="caption" color="textTertiary" style={styles.line}>
        {customer} · {order.pincode} · placed {minutesAgo(order.created_at)}
      </AppText>
      <AppText variant="caption" color="textTertiary" style={styles.line}>
        {order.status === 'cancelled' ? whoCancelledStaff(order.cancelled_by_role) : staffHeadline(order)}
        {rider && order.status !== 'cancelled' ? ` · ${rider}` : ''}
      </AppText>
      {order.status === 'cancelled' && order.cancel_reason ? <AppText variant="caption" color="error" style={styles.line}>{order.cancel_reason}</AppText> : null}
      {(order.rider_rejections ?? 0) > 0 || row.reasons?.length ? (
        <View style={styles.badges}>
          {row.reasons?.map((reason) => (
            <View key={reason} style={styles.badge}><AppText variant="captionStrong" color="error">{attentionLabel(reason)}</AppText></View>
          ))}
          {!row.reasons && (order.rider_rejections ?? 0) > 0 && order.status === 'pending' ? (
            <View style={styles.badge}><AppText variant="captionStrong" color="warning">Rejected by {order.rider_rejections} rider{order.rider_rejections === 1 ? '' : 's'}</AppText></View>
          ) : null}
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.gutter, paddingVertical: spacing.lg },
  backButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  title: { flex: 1 },
  search: { paddingHorizontal: layout.gutter },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xxl, flexGrow: 1 },
  footer: { paddingVertical: spacing.lg },
  card: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  line: { marginTop: spacing.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill, backgroundColor: colors.errorSoft },
});
