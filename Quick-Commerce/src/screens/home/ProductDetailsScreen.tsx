import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  AppText,
  CatalogGate,
  EmptyState,
  PressableScale,
  ProductImage,
  ProductSection,
  QuantitySelector,
} from '../../components';
import { useCart } from '../../context/CartContext';
import { useStore } from '../../context/StoreContext';
import * as catalogService from '../../services/catalogService';
import { lookForCategory } from '../../data/categoryLooks';
import { Product } from '../../types';
import { formatPrice } from '../../utils/price';
import { colors, fontFamilies, layout, radius, shadows, spacing } from '../../theme';
import type { MainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'ProductDetails'>;

const highlightsFor = (storeName: string) => [
  { icon: 'flash' as const, title: '10 min delivery', caption: `From ${storeName}` },
  { icon: 'leaf' as const, title: 'Quality checked', caption: 'Sorted and packed same day' },
  { icon: 'refresh' as const, title: 'Easy returns', caption: 'Report an issue within 24 hrs' },
];

export function ProductDetailsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { getQuantity, addItem, decrementByProductId, totals } = useCart();
  const { getProductById, products } = useStore();
  const [activeImage, setActiveImage] = useState(0);
  const [fetchedProduct, setFetchedProduct] = useState<Product | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const catalogProduct = getProductById(route.params.productId);
  const product = catalogProduct ?? fetchedProduct;

  // If the product isn't in the local catalog (deep link, first launch), fetch by ID.
  useEffect(() => {
    if (catalogProduct || fetchedProduct) return;
    let cancelled = false;
    setIsFetching(true);
    catalogService
      .getProductByID(route.params.productId)
      .then((p) => {
        if (!cancelled) setFetchedProduct(p);
      })
      .catch((e) => {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : 'Could not load product.');
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogProduct, fetchedProduct, route.params.productId]);

  const related = useMemo(() => {
    if (!product) return [];
    return products
      .filter((p) => p.id !== product.id && p.category_id === product.category_id)
      .slice(0, 10);
  }, [product, products]);

  const goToProduct = useCallback(
    (next: Product) => navigation.push('ProductDetails', { productId: next.id }),
    [navigation],
  );

  const goToCart = useCallback(
    () => navigation.navigate('Tabs', { screen: 'Cart' }),
    [navigation],
  );

  if (!product) {
    if (isFetching) {
      return (
        <SafeAreaView style={[styles.screen, styles.centerFill]} edges={['top', 'bottom']}>
          <ActivityIndicator color={colors.primary} size="large" />
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.missingBar}>
          <PressableScale
            onPress={() => navigation.goBack()}
            scaleTo={0.9}
            haptic="none"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.circleButton}
          >
            <Ionicons name="arrow-back" size={21} color={colors.text} />
          </PressableScale>
        </View>
        <CatalogGate>
          <EmptyState
            emoji="🫥"
            title={fetchError ? 'Could not load product' : 'Product not found'}
            message={fetchError ?? 'This item may no longer be available in your area.'}
            actionLabel="Go back"
            onActionPress={() => navigation.goBack()}
          />
        </CatalogGate>
      </SafeAreaView>
    );
  }

  const quantity = getQuantity(product.id);
  const inStock = product.quantity > 0;
  const look = lookForCategory(product.category_name);
  const tint = look.tint;
  const heroSize = Math.min(layout.screenWidth * 0.62, 260);
  const gallery = product.images?.length ? product.images : product.image_url ? [product.image_url] : [];
  const onGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / layout.screenWidth);
    setActiveImage(index);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <View style={[styles.topBar, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <PressableScale
          onPress={() => navigation.goBack()}
          scaleTo={0.9}
          haptic="none"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.circleButton}
        >
          <Ionicons name="arrow-back" size={21} color={colors.text} />
        </PressableScale>

        <PressableScale
          onPress={goToCart}
          scaleTo={0.9}
          haptic="none"
          accessibilityRole="button"
          accessibilityLabel={`Open cart, ${totals.itemCount} items`}
          style={styles.circleButton}
        >
          <Ionicons name="cart-outline" size={21} color={colors.text} />
          {totals.itemCount > 0 ? <View style={styles.cartDot} /> : null}
        </PressableScale>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
      >
        <View style={[styles.hero, { backgroundColor: tint, paddingTop: insets.top + 64 }]}>
          {gallery.length > 1 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onGalleryScroll}
                style={styles.gallery}
              >
                {gallery.map((uri, index) => (
                  <View key={`${uri}-${index}`} style={[styles.gallerySlide, { width: layout.screenWidth }]}>
                    <ProductImage
                      uri={uri}
                      fallbackText={product.name}
                      size={heroSize}
                      tint={tint}
                      radiusToken="lg"
                      contentFit="cover"
                    />
                  </View>
                ))}
              </ScrollView>
              <View style={styles.dots}>
                {gallery.map((uri, index) => (
                  <View
                    key={`dot-${uri}-${index}`}
                    style={[styles.dot, index === activeImage ? styles.dotActive : styles.dotInactive]}
                  />
                ))}
              </View>
            </>
          ) : (
            <ProductImage
              uri={gallery[0] ?? product.image_url}
              fallbackText={product.name}
              size={heroSize}
              tint={tint}
              radiusToken="lg"
              contentFit="cover"
            />
          )}
        </View>

        <Animated.View entering={FadeInDown.duration(300)} style={styles.body}>
          <AppText variant="heading1" style={styles.name}>
            {product.name}
          </AppText>

          <View style={styles.storeRow}>
            <Ionicons name="storefront-outline" size={15} color={colors.primary} />
            <AppText variant="bodySmall" color="textSecondary" style={styles.storeText}>
              Sold by <AppText variant="bodySmall" style={styles.storeName}>{product.store_name}</AppText>
            </AppText>
          </View>

          {product.description ? (
            <AppText variant="bodySmall" color="textSecondary">
              {product.description}
            </AppText>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.priceRow}>
            <View style={styles.priceBlock}>
              <View style={styles.priceLine}>
                <AppText variant="heading1">{formatPrice(product.price)}</AppText>
                {product.mrp && product.mrp > product.price ? (
                  <AppText variant="bodySmall" color="textTertiary" style={styles.mrp}>{formatPrice(product.mrp)}</AppText>
                ) : null}
                {product.unit ? <AppText variant="bodySmall" color="textTertiary" style={styles.unit}>{product.unit}</AppText> : null}
              </View>
              <AppText variant="caption" color="textTertiary">
                Inclusive of all taxes · {product.quantity} in stock
              </AppText>
            </View>
          </View>

          <View style={styles.highlights}>
            {highlightsFor(product.store_name).map((item) => (
              <View key={item.title} style={styles.highlight}>
                <View style={styles.highlightIcon}>
                  <Ionicons name={item.icon} size={16} color={colors.primary} />
                </View>
                <AppText variant="captionStrong" center style={styles.highlightTitle}>
                  {item.title}
                </AppText>
                <AppText variant="caption" color="textTertiary" center>
                  {item.caption}
                </AppText>
              </View>
            ))}
          </View>
        </Animated.View>

        {related.length > 0 ? (
          <View style={styles.related}>
            <ProductSection
              title="You might also like"
              products={related}
              onProductPress={goToProduct}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.buyBar, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.buyPrice}>
          <AppText variant="bodyStrong">{formatPrice(product.price)}</AppText>
          <AppText variant="caption" color="textTertiary">
            {inStock ? `${product.quantity} in stock` : 'Out of stock'}
          </AppText>
        </View>

        <QuantitySelector
          quantity={quantity}
          onAdd={() => addItem(product)}
          onRemove={() => decrementByProductId(product.id)}
          size="lg"
          disabled={!inStock}
          addLabel="Add to cart"
          productName={product.name}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centerFill: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    position: 'absolute',
    left: layout.gutter,
    right: layout.gutter,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  circleButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  cartDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  content: { flexGrow: 1 },
  hero: { alignItems: 'center', justifyContent: 'center', paddingBottom: spacing.xxxl },
  gallery: { alignSelf: 'stretch' },
  gallerySlide: { alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.lg },
  dot: { height: 7, borderRadius: radius.pill },
  dotActive: { width: 20, backgroundColor: colors.primary },
  dotInactive: { width: 7, backgroundColor: colors.borderStrong },
  body: { paddingHorizontal: layout.gutter, paddingTop: spacing.xl },
  name: { marginBottom: spacing.sm },
  missingBar: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm, alignItems: 'flex-start' },
  storeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  storeText: { marginLeft: spacing.xs, flexShrink: 1 },
  storeName: { fontFamily: fontFamilies.bold },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xl },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceBlock: { flex: 1 },
  priceLine: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  mrp: { textDecorationLine: 'line-through' },
  unit: { marginLeft: 'auto' },
  highlights: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xxl,
  },
  highlight: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
  highlightIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  highlightTitle: { marginBottom: 2 },
  related: { marginTop: spacing.xxxl },
  buyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.md,
    ...shadows.floating,
  },
  buyPrice: { flex: 1 },
});
