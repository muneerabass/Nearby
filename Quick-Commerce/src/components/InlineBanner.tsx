import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { colors, layout, radius, spacing } from '../theme';

interface InlineBannerProps {
  message: string;
  tone?: 'warning' | 'error';
  actionLabel?: string;
  onActionPress?: () => void;
}

/** Slim notice that sits above a list without replacing it. */
export function InlineBanner({ message, tone = 'warning', actionLabel, onActionPress }: InlineBannerProps) {
  const error = tone === 'error';
  return (
    <View style={[styles.banner, error && styles.error]}>
      <Ionicons name={error ? 'alert-circle-outline' : 'cloud-offline-outline'} size={16} color={error ? colors.error : colors.warning} />
      <AppText variant="bodySmall" style={styles.text}>
        {message}
      </AppText>
      {actionLabel && onActionPress ? (
        <PressableScale onPress={onActionPress} scaleTo={0.95} haptic="none" accessibilityRole="button">
          <AppText variant="captionStrong" color="primary">
            {actionLabel}
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: layout.gutter,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  error: { backgroundColor: colors.errorSoft },
  text: { flex: 1, marginHorizontal: spacing.sm },
});
