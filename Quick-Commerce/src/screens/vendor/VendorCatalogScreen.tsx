import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AdminScreenHeader, AppText, EmptyState, ErrorState, FilterChips, InlineBanner, PressableScale, StatusPill } from '../../components';
import * as vendorService from '../../services/vendorService';
import { AdminProduct } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { formatPrice } from '../../utils/price';
import { colors, layout, radius, spacing } from '../../theme';
import type { VendorStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<VendorStackParamList>;
type Filter = 'all' | 'low' | 'out';

const LOW_STOCK_AT = 5;

function stockStatus(quantity: number): 'in-stock' | 'low-stock' | 'out-of-stock' {
  if (quantity <= 0) return 'out-of-stock';
  return quantity <= LOW_STOCK_AT ? 'low-stock' : 'in-stock';
}

export function VendorCatalogScreen() {
  const navigation = useNavigation<Navigation>();
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(async (pull = false) => {
    if (pull) setIsRefreshing(true);
    try {
      setProducts(await vendorService.listProducts());
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load your products.'));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => void load(), [load]));

  const changeStock = useCallback(async (product: AdminProduct, next: number) => {
    const quantity = Math.max(0, next);
    const previous = product.quantity ?? 0;
    if (quantity === previous) return;
    setSaving((prev) => new Set(prev).add(product.id));
    setProducts((prev) => prev?.map((p) => (p.id === product.id ? { ...p, quantity } : p)) ?? prev);
    try {
      await vendorService.setInventory(product.id, quantity);
    } catch (e) {
      setProducts((prev) => prev?.map((p) => (p.id === product.id ? { ...p, quantity: previous } : p)) ?? prev);
      Alert.alert('Could not update stock', getErrorMessage(e));
    } finally {
      setSaving((prev) => {
        const copy = new Set(prev);
        copy.delete(product.id);
        return copy;
      });
    }
  }, []);

  const visible = (products ?? []).filter((p) => {
    const quantity = p.quantity ?? 0;
    if (filter === 'out') return quantity <= 0;
    if (filter === 'low') return quantity > 0 && quantity <= LOW_STOCK_AT;
    return true;
  });
  const lowCount = (products ?? []).filter((p) => (p.quantity ?? 0) > 0 && (p.quantity ?? 0) <= LOW_STOCK_AT).length;
  const outCount = (products ?? []).filter((p) => (p.quantity ?? 0) <= 0).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <AdminScreenHeader eyebrow="ZIPP VENDOR" title="Catalog" subtitle="Your products and stock" actionLabel="Add" onAction={() => navigation.navigate('VendorProductForm')} />
      </View>
      <FilterChips
        value={filter}
        onChange={setFilter}
        options={[{ key: 'all', label: 'All' }, { key: 'low', label: 'Low stock', count: lowCount }, { key: 'out', label: 'Out of stock', count: outCount }]}
      />
      {!products && !error ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : !products ? (
        <ErrorState message={error ?? ''} onRetry={() => void load()} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
          ListHeaderComponent={error ? <InlineBanner message={error} actionLabel="Retry" onActionPress={() => void load()} /> : null}
          ListEmptyComponent={<EmptyState icon="pricetags-outline" title={filter === 'all' ? 'No products yet' : 'Nothing here'} message={filter === 'all' ? 'Add your first product to start selling.' : 'No products match this filter.'} />}
          renderItem={({ item }) => {
            const quantity = item.quantity ?? 0;
            const busy = saving.has(item.id);
            return (
              <View style={[styles.card, item.is_active === false && styles.inactive]}>
                <PressableScale onPress={() => navigation.navigate('VendorProductForm', { productId: item.id })} haptic="none" scaleTo={0.985} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} style={styles.info}>
                  <AppText variant="bodyStrong" numberOfLines={1}>{item.name}</AppText>
                  <AppText variant="caption" color="textSecondary">{formatPrice(item.price)}{item.unit ? ` · ${item.unit}` : ''}{item.is_active === false ? ' · hidden' : ''}</AppText>
                  <View style={styles.pill}><StatusPill status={stockStatus(quantity)} /></View>
                </PressableScale>
                <View style={styles.stepper}>
                  <PressableScale onPress={() => void changeStock(item, quantity - 1)} disabled={busy || quantity <= 0} haptic="none" scaleTo={0.9} accessibilityRole="button" accessibilityLabel={`Decrease ${item.name} stock`} style={styles.stepButton}>
                    <Ionicons name="remove" size={18} color={colors.text} />
                  </PressableScale>
                  <AppText variant="bodyStrong" style={styles.qty}>{quantity}</AppText>
                  <PressableScale onPress={() => void changeStock(item, quantity + 1)} disabled={busy} haptic="none" scaleTo={0.9} accessibilityRole="button" accessibilityLabel={`Increase ${item.name} stock`} style={styles.stepButton}>
                    <Ionicons name="add" size={18} color={colors.text} />
                  </PressableScale>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: layout.gutter, paddingTop: spacing.lg },
  loader: { marginTop: spacing.xxl },
  list: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xxl, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  inactive: { opacity: 0.6 },
  info: { flex: 1, paddingRight: spacing.md },
  pill: { marginTop: spacing.xs },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepButton: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 28, textAlign: 'center' },
});
