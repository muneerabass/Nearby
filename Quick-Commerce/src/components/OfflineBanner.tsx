import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { AppText } from './AppText';
import { isOffline, onConnectivityChange } from '../services/apiClient';
import { colors, spacing } from '../theme';

/** Slim bar shown while requests can't reach the server; clears on the next success. */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(isOffline());

  useEffect(() => onConnectivityChange(setOffline), []);

  if (!offline) return null;
  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(160)}
      pointerEvents="none"
      style={[styles.wrap, { paddingTop: insets.top + spacing.xs }]}
    >
      <View style={styles.row}>
        <Ionicons name="cloud-offline-outline" size={14} color={colors.textInverse} />
        <AppText variant="captionStrong" color="textInverse" style={styles.text}>
          Can’t reach the server — retrying when you’re back online
        </AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.text, paddingBottom: spacing.xs, zIndex: 100 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  text: { marginLeft: spacing.xs },
});
