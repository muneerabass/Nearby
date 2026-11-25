import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AppText, CatalogGate, CategoryCard, EmptyState, FloatingCartBar } from '../../components';
import { useStore } from '../../context/StoreContext';
import { lookForCategory } from '../../data/categoryLooks';
import { CategoryRef } from '../../types';
import { colors, layout, radius, spacing, typography } from '../../theme';
import type { MainStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<MainStackParamList>;

export function CategoriesScreen() {
  const navigation = useNavigation<Navigation>();
  const { categories: categoryRows, products } = useStore();
  const [filter, setFilter] = useState('');

  const categories = useMemo<CategoryRef[]>(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => {
      if (product.category_id) counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1);
    });
    return categoryRows.map((category) => {
      const look = lookForCategory(category.name);
      return {
        id: category.id,
        categoryKey: category.id,
        name: category.name,
        image_url: category.image_url,
        icon: look.icon,
        tint: look.tint,
        color: look.color,
        productCount: category.product_count || counts.get(category.id) || 0,
      };
    });
  }, [categoryRows, products]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [filter, categories]);

  const goToCategory = useCallback(
    (category: CategoryRef) => navigation.navigate('CategoryProducts', { categoryId: category.id }),
    [navigation],
  );

  const goToCart = useCallback(
    () => navigation.navigate('Tabs', { screen: 'Cart' }),
    [navigation],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: CategoryRef; index: number }) => (
      <Animated.View entering={FadeInDown.duration(280).delay(Math.min(index, 8) * 35)}>
        <CategoryCard category={item} onPress={goToCategory} variant="grid" />
      </Animated.View>
    ),
    [goToCategory],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <AppText variant="heading1">Categories</AppText>
        <AppText variant="bodySmall" color="textSecondary" style={styles.subtitle}>
          Everything you need, sorted into aisles
        </AppText>
      </View>

      <CatalogGate>
      <View style={styles.filterWrap}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder="Filter categories"
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.primary}
          style={styles.filterInput}
          autoCorrect={false}
          accessibilityLabel="Filter categories"
        />
        {filter.length > 0 ? (
          <Pressable
            onPress={() => setFilter('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear filter"
          >
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id ?? 'none'}
        renderItem={renderItem}
        numColumns={layout.categoryGridColumns}
        key={`cols-${layout.categoryGridColumns}`}
        columnWrapperStyle={styles.column}
        ItemSeparatorComponent={RowSeparator}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        removeClippedSubviews
        ListEmptyComponent={
          <EmptyState
            compact
            icon="grid-outline"
            title={filter.trim() ? 'Nothing here yet' : 'No categories yet'}
            message={
              filter.trim()
                ? `No category matches “${filter.trim()}”. Try a different word.`
                : 'Stores near you haven’t listed any products yet. Check back soon.'
            }
          />
        }
      />

      </CatalogGate>

      <FloatingCartBar onPress={goToCart} respectSafeArea={false} />
    </SafeAreaView>
  );
}

const RowSeparator = () => <View style={{ height: spacing.xl }} />;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  subtitle: { marginTop: spacing.xs },
  filterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    marginHorizontal: layout.gutter,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
  },
  filterInput: {
    flex: 1,
    ...typography.body,
    fontSize: 15,
    color: colors.text,
    marginHorizontal: spacing.md,
    paddingVertical: 0,
  },
  column: { gap: spacing.md, justifyContent: 'flex-start' },
  listContent: {
    paddingHorizontal: layout.gutter,
    paddingBottom: spacing.huge + layout.floatingBarHeight,
  },
});
