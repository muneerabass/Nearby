import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components';
import { useVendor } from '../context/VendorContext';
import { colors, fontFamilies, radius, shadows, spacing } from '../theme';
import type { VendorTabParamList } from './types';

type VendorTab = keyof VendorTabParamList;

const ICONS: Record<VendorTab, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  VendorOrders: { active: 'receipt', inactive: 'receipt-outline' },
  VendorDashboard: { active: 'stats-chart', inactive: 'stats-chart-outline' },
  VendorCatalog: { active: 'pricetags', inactive: 'pricetags-outline' },
  VendorStore: { active: 'storefront', inactive: 'storefront-outline' },
};

export function VendorTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { newCount } = useVendor();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {state.routes.map((route, index) => {
        const name = route.name as VendorTab;
        const focused = state.index === index;
        const label = (descriptors[route.key].options.title ?? route.name) as string;
        const showBadge = name === 'VendorOrders' && newCount > 0;
        return (
          <Pressable
            key={route.key}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={showBadge ? `${label}, ${newCount} new` : label}
            style={styles.tab}
          >
            <View style={[styles.indicator, focused ? styles.indicatorActive : null]} />
            <View>
              <Ionicons name={focused ? ICONS[name].active : ICONS[name].inactive} size={22} color={focused ? colors.primary : colors.textTertiary} />
              {showBadge ? (
                <View style={styles.badge}>
                  <AppText variant="caption" color="textInverse" style={styles.badgeText}>{newCount > 9 ? '9+' : newCount}</AppText>
                </View>
              ) : null}
            </View>
            <AppText variant="caption" color={focused ? 'primary' : 'textTertiary'} style={styles.label}>{label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.background, borderTopWidth: Platform.OS === 'ios' ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border, paddingTop: spacing.xs, ...shadows.tabBar },
  tab: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', paddingTop: spacing.md, position: 'relative' },
  indicator: { position: 'absolute', top: 0, width: 26, height: 3, borderRadius: radius.pill },
  indicatorActive: { backgroundColor: colors.primary },
  label: { marginTop: spacing.xs, fontFamily: fontFamilies.semiBold },
  badge: { position: 'absolute', top: -6, right: -12, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: radius.pill, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, lineHeight: 14 },
});
