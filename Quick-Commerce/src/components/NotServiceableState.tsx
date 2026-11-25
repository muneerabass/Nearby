import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AppText } from './AppText';
import { Button } from './Button';
import { colors, radius, spacing } from '../theme';

interface NotServiceableStateProps {
  pincode: string | null;
  /** Opens the saved-address list (which also lets the user add one). */
  onChangeAddress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Shown when no active store delivers to the customer's pincode. */
export const NotServiceableState = React.memo(function NotServiceableState({
  pincode,
  onChangeAddress,
  style,
}: NotServiceableStateProps) {
  const needsAddress = !pincode;
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={[styles.container, style]}>
      <View style={styles.iconRing}>
        <Ionicons name={needsAddress ? 'location-outline' : 'storefront-outline'} size={40} color={colors.primary} />
      </View>
      <AppText variant="heading2" center style={styles.title}>
        {needsAddress ? 'Where should we deliver?' : `We’re not in ${pincode} yet`}
      </AppText>
      <AppText variant="bodySmall" color="textSecondary" center style={styles.message}>
        {needsAddress
          ? 'Add a delivery address to see what’s available near you.'
          : 'None of our stores deliver to your address right now. Try a different address — we’re adding new areas often.'}
      </AppText>
      <Button
        label={needsAddress ? 'Add delivery address' : 'Choose a saved address'}
        onPress={onChangeAddress}
        size="md"
        fullWidth={false}
        variant={needsAddress ? 'primary' : 'secondary'}
        icon={needsAddress ? 'add' : undefined}
        style={styles.action}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.huge,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: { marginBottom: spacing.sm },
  message: { maxWidth: 300 },
  action: { alignSelf: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.xxxl },
});
