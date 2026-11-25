import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { OrderStatus } from '../types';
import { statusLook } from '../utils/orderStatus';
import { radius, spacing } from '../theme';

/** Coloured status pill shared by the customer, admin and vendor order screens. */
export function OrderStatusChip({ status, label }: { status: OrderStatus; label?: string }) {
  const look = statusLook(status);
  return (
    <View style={[styles.pill, { backgroundColor: look.soft }]}>
      <AppText variant="captionStrong" style={{ color: look.color }}>
        {label ?? look.label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill },
});
