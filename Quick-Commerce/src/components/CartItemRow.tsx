import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { ProductImage } from './ProductImage';
import { QuantitySelector } from './QuantitySelector';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { CartIssue, CartLine } from '../types';
import { PressableScale } from './PressableScale';
import { formatPrice } from '../utils/price';
import { colors, fontFamilies, spacing } from '../theme';

interface CartItemRowProps {
  line: CartLine;
  /** Why this line can't be fulfilled right now, if it can't. */
  issue?: CartIssue;
  /** One-tap fix for the issue: shrink to what's left, or drop the line. */
  onFix?: () => void;
}

/** Highest quantity the store can give for this line (the per-item cap is enforced server-side). */
const MAX_PER_ITEM = 20;

/**
 * Row-rendered against a server cart line. Looks up the live product in StoreContext
 * for its image + quantity-left, falling back to a plain row if the product is no
 * longer stocked in the active store.
 */
export const CartItemRow = React.memo(function CartItemRow({ line, issue, onFix }: CartItemRowProps) {
  const { incrementLine, decrementLine } = useCart();
  const { getProductById } = useStore();
  const product = getProductById(line.product_id);

  const handleAdd = useCallback(() => incrementLine(line), [incrementLine, line]);
  const handleRemove = useCallback(() => decrementLine(line), [decrementLine, line]);

  return (
    <View style={styles.row}>
      <ProductImage
        uri={product?.image_url ?? line.image_url}
        fallbackText={line.product_name}
        size={56}
        tint={colors.surfaceMuted}
        radiusToken="sm"
        recyclingKey={line.id}
      />

      <View style={styles.details}>
        <AppText variant="bodySmall" numberOfLines={2} style={styles.name}>
          {line.product_name}
        </AppText>
        <AppText variant="caption" color="textTertiary" style={styles.unit}>
          {formatPrice(line.unit_price)} each
        </AppText>
        {issue ? (
          <View style={styles.issue}>
            <AppText variant="captionStrong" color="error">
              {issue.code === 'insufficient_stock' ? `Only ${issue.available_quantity ?? 0} left` : issue.code === 'out_of_stock' ? 'Out of stock' : issue.message}
            </AppText>
            {onFix ? (
              <PressableScale onPress={onFix} scaleTo={0.96} haptic="none" accessibilityRole="button" style={styles.fix}>
                <AppText variant="captionStrong" color="primary">
                  {issue.code === 'insufficient_stock' ? `Update to ${issue.available_quantity ?? 0}` : 'Remove'}
                </AppText>
              </PressableScale>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.trailing}>
        <QuantitySelector
          quantity={line.quantity}
          onAdd={handleAdd}
          onRemove={handleRemove}
          productName={line.product_name}
          maxReached={line.quantity >= Math.min(line.available_quantity, MAX_PER_ITEM)}
        />

        <View style={styles.priceBlock}>
          <AppText variant="bodyStrong">{formatPrice(line.line_total)}</AppText>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  details: { flex: 1, marginHorizontal: spacing.md },
  name: { fontFamily: fontFamilies.semiBold },
  unit: { marginTop: 2 },
  issue: { marginTop: spacing.xs },
  fix: { alignSelf: 'flex-start', marginTop: spacing.xs, paddingVertical: spacing.xs },
  trailing: { alignItems: 'flex-end' },
  priceBlock: { alignItems: 'flex-end', marginTop: spacing.sm },
});
