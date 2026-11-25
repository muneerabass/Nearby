import { OrderItem, Product } from '../types';

export interface ReorderCandidate {
  item: OrderItem;
  product: Product;
  quantity: number;
}

export interface ReorderPlan {
  available: ReorderCandidate[];
  unavailable: string[];
  storeId: string | null;
}

/**
 * Reconciles historical order lines with current catalog responses. A cart can
 * contain one store only, so lines moved to another store are reported instead
 * of being silently mixed into the reorder.
 */
export function buildReorderPlan(items: OrderItem[], products: Array<Product | null>): ReorderPlan {
  const unavailable: string[] = [];
  const candidates = items.flatMap((item, index) => {
    const product = products[index];
    if (!product || product.quantity <= 0) {
      unavailable.push(item.product_name);
      return [];
    }
    return [{ item, product, quantity: Math.min(item.quantity, product.quantity, 20) }];
  });
  const storeId = candidates[0]?.product.store_id ?? null;
  if (!storeId) return { available: [], unavailable, storeId: null };
  const available = candidates.filter(({ product, item }) => {
    if (product.store_id !== storeId) {
      unavailable.push(`${item.product_name} (different store)`);
      return false;
    }
    return true;
  });
  return { available, unavailable, storeId };
}
