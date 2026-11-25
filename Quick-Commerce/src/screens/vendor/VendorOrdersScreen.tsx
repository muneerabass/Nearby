import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppText, EmptyState, ErrorState, FilterChips, InlineBanner, ReasonSheet, VendorOrderCard } from '../../components';
import { useVendor } from '../../context/VendorContext';
import * as vendorService from '../../services/vendorService';
import { Order } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { shortOrderId } from '../../utils/orderStatus';
import { colors, layout, spacing } from '../../theme';
import type { VendorStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<VendorStackParamList>;
type Tab = 'new' | 'progress' | 'completed' | 'cancelled';

const REJECT_REASONS = ['Item out of stock', 'Item damaged', 'Store is closing', 'Cannot prepare in time'];

export function VendorOrdersScreen() {
  const navigation = useNavigation<Navigation>();
  const { store, openOrders, newCount, isHydrated, isRefreshing, error, refresh, isBusy, markReady, reject } = useVendor();
  const [tab, setTab] = useState<Tab>('new');
  const [rejecting, setRejecting] = useState<Order | null>(null);

  // Finished orders are paged on demand; open orders come from the polled context.
  const [history, setHistory] = useState<Order[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const finishedStatus = tab === 'completed' || tab === 'cancelled' ? tab : null;

  const loadHistory = useCallback(
    async (status: 'completed' | 'cancelled', before: string | null) => {
      setHistoryLoading(true);
      try {
        const page = await vendorService.listOrders({ status, before, limit: 20 });
        setHistory((prev) => (before ? [...prev, ...page.orders] : page.orders));
        setCursor(page.next_before ?? null);
        setHistoryError(null);
      } catch (e) {
        setHistoryError(getErrorMessage(e, 'Could not load orders.'));
      } finally {
        setHistoryLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!finishedStatus) return;
    setHistory([]);
    setCursor(null);
    void loadHistory(finishedStatus, null);
  }, [finishedStatus, loadHistory]);

  const lists = useMemo(
    () => ({
      new: openOrders.filter((o) => o.status === 'pending'),
      progress: openOrders.filter((o) => o.status !== 'pending'),
    }),
    [openOrders],
  );
  const data = finishedStatus ? history : lists[tab === 'new' ? 'new' : 'progress'];

  const onReady = useCallback(
    async (order: Order) => {
      const result = await markReady(order.id);
      if (!result.ok) Alert.alert('Could not mark ready', result.message ?? 'Try again.');
    },
    [markReady],
  );

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing || (finishedStatus !== null && historyLoading && history.length === 0)}
      onRefresh={() => (finishedStatus ? loadHistory(finishedStatus, null) : void refresh())}
      tintColor={colors.primary}
    />
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <AppText variant="overline" color="primary">ZIPP VENDOR</AppText>
        <AppText variant="heading1" style={styles.title}>{store?.name ?? 'Orders'}</AppText>
        {store && !store.is_active ? (
          <AppText variant="bodySmall" color="error">Store is closed — customers cannot place new orders.</AppText>
        ) : (
          <AppText variant="bodySmall" color="textSecondary">Orders for your store, updated automatically.</AppText>
        )}
      </View>

      <FilterChips
        value={tab}
        onChange={setTab}
        options={[
          { key: 'new', label: 'New', count: newCount },
          { key: 'progress', label: 'In progress', count: lists.progress.length },
          { key: 'completed', label: 'Completed' },
          { key: 'cancelled', label: 'Cancelled' },
        ]}
      />

      {!isHydrated ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (finishedStatus ? historyError : error) && data.length === 0 ? (
        <ErrorState message={(finishedStatus ? historyError : error) ?? ''} onRetry={() => (finishedStatus ? void loadHistory(finishedStatus, null) : void refresh())} style={styles.center} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={refreshControl}
          ListHeaderComponent={(finishedStatus ? historyError : error) ? <InlineBanner message={(finishedStatus ? historyError : error) ?? ''} actionLabel="Retry" onActionPress={() => (finishedStatus ? void loadHistory(finishedStatus, null) : void refresh())} /> : null}
          ListEmptyComponent={
            historyLoading ? null : (
              <EmptyState
                icon={tab === 'new' ? 'receipt-outline' : tab === 'progress' ? 'bicycle-outline' : tab === 'completed' ? 'checkmark-done-outline' : 'close-circle-outline'}
                title={tab === 'new' ? 'No new orders' : tab === 'progress' ? 'Nothing in progress' : tab === 'completed' ? 'No completed orders yet' : 'No cancelled orders'}
                message={tab === 'new' ? 'New orders appear here as customers place them.' : tab === 'progress' ? 'Orders a rider has accepted show up here.' : 'They will be listed here.'}
              />
            )
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (finishedStatus && cursor && !historyLoading) void loadHistory(finishedStatus, cursor);
          }}
          ListFooterComponent={finishedStatus && historyLoading && history.length > 0 ? <ActivityIndicator color={colors.primary} style={styles.footer} /> : null}
          renderItem={({ item }) => (
            <VendorOrderCard
              order={item}
              busy={isBusy(item.id)}
              onPress={() => navigation.navigate('VendorOrderDetails', { orderId: item.id })}
              onReady={() => void onReady(item)}
              onReject={() => setRejecting(item)}
            />
          )}
        />
      )}

      <ReasonSheet
        visible={rejecting !== null}
        title={rejecting ? `Reject ${shortOrderId(rejecting.id)}?` : 'Reject order'}
        message="The customer sees this reason and the stock goes back on your shelf. This cannot be undone."
        confirmLabel="Reject order"
        suggestions={REJECT_REASONS}
        onClose={() => setRejecting(null)}
        onSubmit={async (reason) => {
          if (!rejecting) return null;
          const result = await reject(rejecting.id, reason);
          return result.ok ? null : result.message ?? 'Could not reject this order.';
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: layout.gutter, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  title: { marginTop: spacing.xs, marginBottom: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xxl, flexGrow: 1 },
  footer: { paddingVertical: spacing.lg },
});
