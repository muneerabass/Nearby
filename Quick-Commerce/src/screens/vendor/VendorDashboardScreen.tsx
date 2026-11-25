import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AdminScreenHeader, AdminStatCard, AppText, ErrorState, FilterChips, InlineBanner } from '../../components';
import { useVendor } from '../../context/VendorContext';
import { useFocusedPolling } from '../../hooks/useFocusedPolling';
import * as vendorService from '../../services/vendorService';
import { StoreStats } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { durationLabel } from '../../utils/orderStatus';
import { formatPriceCompact } from '../../utils/price';
import { colors, layout, radius, shadows, spacing } from '../../theme';

type Period = 'today' | '7d' | '30d';

/** Local-day boundaries: the server buckets by the viewer's day via tz_offset. */
function rangeFor(period: Period) {
  const now = new Date();
  const days = period === 'today' ? 0 : period === '7d' ? 6 : 29;
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  const to = new Date(now.getTime() + 60_000);
  return { from: from.toISOString(), to: to.toISOString(), tzOffset: -now.getTimezoneOffset() };
}

export function VendorDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { store } = useVendor();
  const [period, setPeriod] = useState<Period>('today');
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(
    async (pull = false): Promise<boolean> => {
      if (pull) setIsRefreshing(true);
      try {
        setStats(await vendorService.getStats(rangeFor(period)));
        setError(null);
        return true;
      } catch (e) {
        setError(getErrorMessage(e, 'Could not load your numbers.'));
        return false;
      } finally {
        setIsRefreshing(false);
      }
    },
    [period],
  );

  useFocusedPolling(() => load(), 60_000);

  const switchPeriod = useCallback((next: Period) => {
    setStats(null);
    setPeriod(next);
  }, []);

  const maxOrders = Math.max(1, ...(stats?.daily.map((d) => d.orders) ?? [1]));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        <AdminScreenHeader eyebrow="ZIPP VENDOR" title="Insights" subtitle={store ? `How ${store.name} is doing` : 'How your store is doing'} />
        <View style={styles.chips}>
          <FilterChips
            value={period}
            onChange={switchPeriod}
            options={[{ key: 'today', label: 'Today' }, { key: '7d', label: 'Last 7 days' }, { key: '30d', label: 'Last 30 days' }]}
          />
        </View>

        {!stats && !error ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : !stats ? (
          <ErrorState message={error ?? ''} onRetry={() => void load()} />
        ) : (
          <>
            {error ? <InlineBanner message={error} actionLabel="Retry" onActionPress={() => void load()} /> : null}
            {stats.assigned_riders === 0 ? (
              <View style={[styles.warning, { backgroundColor: colors.errorSoft }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
                <AppText variant="bodySmall" style={styles.flex}>No riders are assigned to your store yet. Ask the admin to assign riders.</AppText>
              </View>
            ) : stats.online_riders === 0 ? (
              <View style={[styles.warning, { backgroundColor: colors.warningSoft }]}>
                <Ionicons name="bicycle-outline" size={18} color={colors.warning} />
                <AppText variant="bodySmall" style={styles.flex}>No rider is online right now. New orders will wait until one comes online.</AppText>
              </View>
            ) : null}

            <View style={styles.row}>
              <AdminStatCard label="Orders" value={stats.total_orders} icon="receipt-outline" />
              <AdminStatCard label="Delivered" value={stats.completed_orders} icon="checkmark-done-outline" tone="success" />
            </View>
            <View style={[styles.row, styles.gap]}>
              <AdminStatCard label="Revenue (delivered)" value={formatPriceCompact(stats.completed_revenue)} icon="cash-outline" tone="success" />
              <AdminStatCard label="Cancelled" value={stats.cancelled_orders} icon="close-circle-outline" tone="error" />
            </View>
            <View style={[styles.row, styles.gap]}>
              <AdminStatCard label="Open now" value={stats.active_orders} icon="time-outline" tone="warning" />
              <AdminStatCard label="Rider rejections" value={stats.rider_rejections} icon="hand-left-outline" tone={stats.rider_rejections > 0 ? 'warning' : 'primary'} />
            </View>
            <View style={[styles.row, styles.gap]}>
              <AdminStatCard label="Riders online" value={`${stats.online_riders}/${stats.assigned_riders}`} icon="bicycle-outline" tone={stats.online_riders > 0 ? 'success' : 'error'} />
              <AdminStatCard label="Avg time to accept" value={durationLabel(stats.avg_seconds_to_accept)} icon="timer-outline" />
            </View>
            <View style={[styles.row, styles.gap]}>
              <AdminStatCard label="Avg time to ready" value={durationLabel(stats.avg_seconds_to_ready)} icon="cube-outline" />
              <AdminStatCard label="Avg accept → delivered" value={durationLabel(stats.avg_seconds_accept_to_delivered)} icon="navigate-outline" />
            </View>

            {Object.keys(stats.cancelled_by_role).length > 0 ? (
              <View style={styles.card}>
                <AppText variant="bodyStrong">Why orders were cancelled</AppText>
                {Object.entries(stats.cancelled_by_role).map(([role, count]) => (
                  <View key={role} style={styles.line}>
                    <AppText variant="bodySmall" color="textSecondary">{role === 'vendor' ? 'Rejected by you' : role === 'system' ? 'No rider accepted in time' : role === 'admin' ? 'Cancelled by admin' : role === 'customer' ? 'Cancelled by customer' : 'Other'}</AppText>
                    <AppText variant="bodyStrong">{count}</AppText>
                  </View>
                ))}
              </View>
            ) : null}

            {stats.daily.length > 1 ? (
              <>
                <AppText variant="heading3" style={styles.section}>Orders per day</AppText>
                <View style={styles.card}>
                  <View style={styles.bars}>
                    {stats.daily.map((day) => (
                      <View key={day.date} style={styles.barColumn}>
                        <View style={[styles.bar, { height: Math.max(4, Math.round((day.orders / maxOrders) * 80)) }]} />
                        <AppText variant="caption" color="textTertiary">{day.date.slice(8)}</AppText>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            ) : null}

            <AppText variant="heading3" style={styles.section}>Top products</AppText>
            <View style={styles.card}>
              {stats.top_products.length === 0 ? (
                <AppText variant="bodySmall" color="textSecondary">No sales in this period yet.</AppText>
              ) : (
                stats.top_products.map((product, index) => (
                  <View key={product.product_id} style={styles.line}>
                    <AppText variant="bodySmall" style={styles.flex}>{index + 1}. {product.product_name}</AppText>
                    <AppText variant="caption" color="textSecondary">{product.quantity} sold · {formatPriceCompact(product.revenue)}</AppText>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing.lg },
  chips: { marginHorizontal: -layout.gutter },
  loader: { marginTop: spacing.xxl },
  warning: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.md },
  gap: { marginTop: spacing.md },
  section: { marginTop: spacing.xl, marginBottom: spacing.sm },
  card: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, ...shadows.soft },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs, gap: spacing.md },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 110 },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  bar: { width: '55%', borderRadius: radius.xs, backgroundColor: colors.primary },
});
