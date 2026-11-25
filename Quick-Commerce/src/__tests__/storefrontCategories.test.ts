import { isStorefrontCategory, MAX_STOREFRONT_CATEGORIES, STOREFRONT_CATEGORIES, storefrontCategories } from '../data/storefrontCategories';

describe('storefront category policy', () => {
  it('keeps only the ten requested categories and excludes meat and pets', () => {
    expect(isStorefrontCategory('Meat & Seafood')).toBe(false);
    expect(isStorefrontCategory('Pet care')).toBe(false);
    expect(isStorefrontCategory('Fruits & Vegetables')).toBe(true);
    expect(STOREFRONT_CATEGORIES.map((category) => category.name)).toEqual([
      'Fruits & Vegetables', 'Dairy & Eggs', 'Grocery & Staples', 'Snacks & Biscuits', 'Cold Drinks & Beverages',
      'Home Care', 'Personal Care', 'Bakery & Breakfast', 'Stationery', 'Daily Essentials',
    ]);
  });

  it('keeps at most ten eligible categories', () => {
    const categories = STOREFRONT_CATEGORIES.map((category) => ({ id: category.id, name: category.name }));
    const visible = storefrontCategories([{ id: 'meat', name: 'Meat' }, { id: 'pet', name: 'Pet care' }, ...categories]);

    expect(visible).toHaveLength(MAX_STOREFRONT_CATEGORIES);
    expect(visible.map((category) => category.name)).not.toContain('Meat');
  });
});
