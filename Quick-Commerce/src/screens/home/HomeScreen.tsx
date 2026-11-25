import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  ListRenderItem,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  AppText,
  CategoryCard,
  DeliveryBanner,
  EmptyState,
  ErrorState,
  HomeSkeleton,
  LocationHeader,
  NotServiceableState,
  ProductSection,
  SearchBar,
  SectionHeader,
} from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { useAddresses } from '../../context/AddressContext';
import { CategoryRef, CustomerCategory, Product } from '../../types';
import { lookForCategory } from '../../data/categoryLooks';
import { colors, gradients, layout, spacing } from '../../theme';
import type { MainStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<MainStackParamList>;

const SEARCH_HINTS = ['milk', 'bananas', 'bread', 'eggs', 'cold drinks', 'juices'];

function initialsFor(name?: string | null): string {
  if (!name) return 'ZU';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'ZU';
}

interface Rail {
  id: string;
  title: string;
  categoryId: string;
  products: Product[];
}

/** Group products using backend-owned category identity and ordering. */
function buildRails(products: Product[], categoryRows: CustomerCategory[]): { rails: Rail[]; categories: CategoryRef[] } {
  const byCategory = new Map<string, Product[]>();
  products.forEach((product) => {
    const key = product.category_id;
    if (!key) return;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(product);
  });
  const rails: Rail[] = [];
  const categories = categoryRows.map((category) => {
    const items = byCategory.get(category.id) ?? [];
    const look = lookForCategory(category.name);
    if (items.length) {
      rails.push({ id: category.id, title: category.name, categoryId: category.id, products: items.slice(0, 10) });
    }
    return {
      id: category.id,
      categoryKey: category.id,
      name: category.name,
      image_url: category.image_url,
      icon: look.icon,
      tint: look.tint,
      color: look.color,
      productCount: category.product_count || items.length,
    };
  });
  return { rails, categories };
}

export function HomeScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { status, isRefreshing, error, refreshError, pincode, products, categories: categoryRows, refresh } = useStore();
  const { defaultAddress, refresh: refreshAddresses } = useAddresses();

  // Re-read addresses when returning to Home (e.g. after picking one elsewhere).
  useFocusEffect(
    useCallback(() => {
      void refreshAddresses();
    }, [refreshAddresses]),
  );

  const { rails, categories } = useMemo(() => buildRails(products, categoryRows), [categoryRows, products]);

  const goToSearch = useCallback(() => navigation.navigate('Search'), [navigation]);

  const goToProduct = useCallback(
    (product: Product) => navigation.navigate('ProductDetails', { productId: product.id }),
    [navigation],
  );

  const goToCategory = useCallback(
    (category: CategoryRef) => navigation.navigate('CategoryProducts', { categoryId: category.id }),
    [navigation],
  );

  const goToCategoriesTab = useCallback(
    () => navigation.navigate('Tabs', { screen: 'Categories' }),
    [navigation],
  );

  const goToProfile = useCallback(
    () => navigation.navigate('Tabs', { screen: 'Profile' }),
    [navigation],
  );

  const goToAddressSelection = useCallback(
    () => navigation.navigate('AddressList', { selectMode: true }),
    [navigation],
  );

  const addressDetail = defaultAddress
    ? [defaultAddress.address_line1, defaultAddress.address_line2, defaultAddress.city]
        .filter(Boolean)
        .join(', ')
    : 'Choose a delivery address';

  const renderSection = useCallback<ListRenderItem<Rail>>(
    ({ item }) => (
      <ProductSection
        title={item.title}
        products={item.products}
        onProductPress={goToProduct}
        onSeeAllPress={() => navigation.navigate('CategoryProducts', { categoryId: item.categoryId })}
      />
    ),
    [goToProduct, navigation],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <DeliveryBanner style={styles.banner} />
        {categories.length > 0 ? (
          <View style={styles.categoriesBlock}>
            <SectionHeader
              title="Shop by category"
              actionLabel="See all"
              onActionPress={goToCategoriesTab}
            />
            <FlatList
              data={categories}
              keyExtractor={(item) => item.id ?? 'none'}
              renderItem={({ item }) => (
                <CategoryCard category={item} onPress={goToCategory} variant="rail" />
              )}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryList}
              ItemSeparatorComponent={CategorySeparator}
              initialNumToRender={6}
              removeClippedSubviews
            />
          </View>
        ) : null}
      </View>
    ),
    [categories, goToCategoriesTab, goToCategory],
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing.md }]}
      >
        <LocationHeader
          etaLabel="Delivery in 10 mins"
          addressLabel={defaultAddress ? 'Delivering to' : 'Choose location'}
          addressDetail={addressDetail}
          initials={initialsFor(user?.name)}
          onAddressPress={goToAddressSelection}
          onAvatarPress={goToProfile}
          style={styles.locationHeader}
        />

        <SearchBar onPress={goToSearch} rotatingHints={SEARCH_HINTS} />
      </LinearGradient>

      {status === 'loading' ? (
        <HomeSkeleton />
      ) : status === 'error' ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.centerScroll}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
        >
          <ErrorState message={error ?? undefined} onRetry={refresh} />
        </ScrollView>
      ) : status === 'needsPincode' || status === 'notServiceable' ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.centerScroll}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
        >
          <NotServiceableState
            pincode={pincode}
            onChangeAddress={goToAddressSelection}
          />
        </ScrollView>
      ) : rails.length === 0 ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.centerScroll}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
        >
          <EmptyState
            icon="basket-outline"
            title="Restocking soon"
            message={`Stores near you are out of stock right now. Pull down to check again in a bit.`}
            actionLabel="Refresh"
            onActionPress={refresh}
          />
        </ScrollView>
      ) : (
        <Animated.View entering={FadeIn.duration(240)} style={styles.flex}>
          {refreshError ? (
            <TouchableOpacity
              onPress={refresh}
              activeOpacity={0.8}
              style={styles.staleBanner}
              accessibilityRole="button"
              accessibilityLabel="Catalog may be outdated, tap to refresh"
            >
              <Ionicons name="cloud-offline-outline" size={15} color={colors.warning} />
              <AppText variant="captionStrong" style={styles.staleBannerText}>
                Couldn't refresh · showing saved products
              </AppText>
              <AppText variant="captionStrong" color="primary">
                Retry
              </AppText>
            </TouchableOpacity>
          ) : null}
          <FlatList
            data={rails}
            keyExtractor={(item) => item.id}
            renderItem={renderSection}
            ListHeaderComponent={listHeader}
            ListFooterComponent={ListFooter}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            windowSize={5}
            removeClippedSubviews
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={refresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
          />
        </Animated.View>
      )}

    </View>
  );
}

const CategorySeparator = () => <View style={{ width: spacing.md }} />;

const ListFooter = () => (
  <View style={styles.footer}>
    <View style={styles.footerRule} />
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.gutter,
    paddingVertical: spacing.sm,
    backgroundColor: colors.warningSoft,
    gap: spacing.xs,
  },
  staleBannerText: { flex: 1, marginLeft: spacing.xs, color: colors.warning },
  header: {
    paddingHorizontal: layout.gutter,
    paddingBottom: spacing.lg,
  },
  locationHeader: { marginBottom: spacing.lg },
  listHeader: { paddingTop: spacing.xl },
  banner: { marginBottom: spacing.xxl },
  categoriesBlock: { marginBottom: spacing.xxl },
  categoryList: { paddingHorizontal: layout.gutter },
  listContent: { paddingBottom: spacing.xxl },
  centerScroll: { flexGrow: 1, justifyContent: 'center' },
  footer: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xxl },
  footerRule: { height: 1, backgroundColor: colors.border },
});
