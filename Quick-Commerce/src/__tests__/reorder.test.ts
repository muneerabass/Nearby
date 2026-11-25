import { buildReorderPlan } from '../utils/reorder';
import { OrderItem, Product } from '../types';

const item = (id: string, name: string): OrderItem => ({ product_id: id, product_name: name, quantity: 3, unit_price: 100, line_total: 300 });
const product = (id: string, storeId: string, quantity: number): Product => ({ id, name: id, price: 100, quantity, store_id: storeId, store_name: storeId });

describe('reorder availability planning', () => {
  it('caps quantities at current stock and reports missing products', () => {
    const plan = buildReorderPlan([item('p1', 'Milk'), item('p2', 'Bread')], [product('p1', 's1', 2), null]);
    expect(plan.available[0].quantity).toBe(2);
    expect(plan.unavailable).toEqual(['Bread']);
  });

  it('does not mix products from a different store into a single cart', () => {
    const plan = buildReorderPlan([item('p1', 'Milk'), item('p2', 'Bread')], [product('p1', 's1', 3), product('p2', 's2', 3)]);
    expect(plan.storeId).toBe('s1');
    expect(plan.available).toHaveLength(1);
    expect(plan.unavailable).toEqual(['Bread (different store)']);
  });
});
