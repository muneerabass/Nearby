import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { CartTotals } from '../context/CartContext';
import { formatPrice } from '../utils/price';
import { colors, radius, spacing } from '../theme';

interface CartSummaryProps {
  totals: CartTotals;
}

function Row({
  label,
  value,
  strong,
  free,
  hint,
}: {
  label: string;
  value: string;
  strong?: boolean;
  free?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.labelBlock}>
        <AppText variant={strong ? 'bodyStrong' : 'bodySmall'} color={strong ? 'text' : 'textSecondary'}>
          {label}
        </AppText>
        {hint ? (
          <AppText variant="caption" color="textTertiary" style={styles.hint}>
            {hint}
          </AppText>
        ) : null}
      </View>

      <View style={styles.valueBlock}>
        <AppText
          variant={strong ? 'bodyStrong' : 'bodySmall'}
          color={free ? 'success' : strong ? 'text' : 'text'}
        >
          {free ? 'FREE' : value}
        </AppText>
      </View>
    </View>
  );
}

export const CartSummary = React.memo(function CartSummary({ totals }: CartSummaryProps) {
  return (
    <View style={styles.card}>
      <AppText variant="heading3" style={styles.heading}>
        Bill details
      </AppText>

      <Row label="Item total" value={formatPrice(totals.subtotal)} />
      <Row
        label="Delivery fee"
        value={formatPrice(totals.deliveryFee)}
        free={totals.deliveryFee === 0}
        hint={
          totals.amountToFreeDelivery > 0
            ? `Add ${formatPrice(totals.amountToFreeDelivery)} more to save it`
            : `Free above ${formatPrice(totals.freeDeliveryThreshold)}`
        }
      />
      <Row label="Handling charge" value={formatPrice(totals.handlingFee)} />

      {totals.minimumOrderValue > 0 ? (
        <Row
          label="Minimum order"
          value={formatPrice(totals.minimumOrderValue)}
          hint={totals.amountToMinimumOrder > 0 ? `Add ${formatPrice(totals.amountToMinimumOrder)} more to continue` : undefined}
        />
      ) : null}

      <View style={styles.divider} />

      <Row label="To pay" value={formatPrice(totals.total)} strong />
      <Row label="Payment method" value="Cash on delivery" hint="Payment is collected only after delivery verification" />
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  heading: { marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  labelBlock: { flex: 1, marginRight: spacing.lg },
  hint: { marginTop: 2 },
  valueBlock: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
});
