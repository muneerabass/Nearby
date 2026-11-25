import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { colors, layout, radius, spacing } from '../theme';

interface FilterChipsProps<T extends string> {
  options: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}

/** Horizontally scrolling single-select chips, used for order status filters. */
export function FilterChips<T extends string>({ options, value, onChange }: FilterChipsProps<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <PressableScale
            key={option.key}
            onPress={() => onChange(option.key)}
            scaleTo={0.96}
            haptic="none"
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.chip, selected && styles.chipActive]}
          >
            <AppText variant="captionStrong" color={selected ? 'textInverse' : 'textSecondary'}>
              {option.label}
              {option.count ? ` · ${option.count}` : ''}
            </AppText>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginBottom: spacing.md },
  row: { gap: spacing.sm, paddingHorizontal: layout.gutter },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.canvas },
  chipActive: { backgroundColor: colors.primary },
});
