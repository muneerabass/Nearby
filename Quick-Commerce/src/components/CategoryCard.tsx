import React, { useCallback } from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { CategoryRef } from '../types';
import { colors, fontFamilies, layout, radius, spacing } from '../theme';

interface CategoryCardProps {
  category: CategoryRef;
  onPress: (category: CategoryRef) => void;
  /** `rail` is the compact home-screen tile; `grid` is the taller Categories-tab card. */
  variant?: 'rail' | 'grid';
  style?: StyleProp<ViewStyle>;
}

export const CategoryCard = React.memo(function CategoryCard({
  category,
  onPress,
  variant = 'rail',
  style,
}: CategoryCardProps) {
  const handlePress = useCallback(() => onPress(category), [onPress, category]);

  const isRail = variant === 'rail';
  const tileWidth = isRail ? layout.categoryTileWidth : layout.categoryGridWidth;
  const iconSize = Math.round(isRail ? tileWidth * 0.42 : tileWidth * 0.36);
  const badgeSize = Math.round(iconSize * 1.7);

  return (
    <PressableScale
      onPress={handlePress}
      scaleTo={0.94}
      haptic="none"
      accessibilityRole="button"
      accessibilityLabel={`${category.name} category, ${category.productCount} items`}
      style={[{ width: tileWidth }, style]}
    >
      <View
        style={[
          styles.tile,
          { backgroundColor: category.tint },
          isRail ? styles.tileRail : styles.tileGrid,
        ]}
      >
        <View style={[styles.badge, { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 }]}>
          {category.image_url ? (
            <Image source={{ uri: category.image_url }} style={styles.categoryImage} resizeMode="cover" />
          ) : (
            <MaterialCommunityIcons name={category.icon} size={iconSize} color={category.color} />
          )}
        </View>
      </View>

      <AppText
        variant="caption"
        numberOfLines={2}
        center
        style={[styles.label, isRail ? styles.labelRail : styles.labelGrid]}
      >
        {category.name}
      </AppText>

      {!isRail ? (
        <AppText variant="caption" color="textTertiary" center>
          {category.productCount} items
        </AppText>
      ) : null}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  tile: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  categoryImage: { width: '100%', height: '100%', borderRadius: 999 },
  tileRail: { aspectRatio: 1 },
  tileGrid: { aspectRatio: 1.05, borderRadius: radius.lg },
  label: { fontFamily: fontFamilies.semiBold, color: colors.text },
  labelRail: { marginTop: spacing.sm, minHeight: 30 },
  labelGrid: { marginTop: spacing.sm, marginBottom: 2, minHeight: 32 },
});
