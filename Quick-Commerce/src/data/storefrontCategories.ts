/** The fixed customer catalogue, kept in the order requested for the home page. */
export const STOREFRONT_CATEGORIES = [
  { id: 'fruits-vegetables', name: 'Fruits & Vegetables', aliases: ['fruits & vegetables', 'fruits and vegetables', 'fruits', 'vegetables', 'fresh produce'] },
  { id: 'dairy-eggs', name: 'Dairy & Eggs', aliases: ['dairy & eggs', 'dairy and eggs', 'dairy', 'eggs'] },
  { id: 'grocery-staples', name: 'Grocery & Staples', aliases: ['grocery & staples', 'grocery and staples', 'grocery', 'groceries', 'staples'] },
  { id: 'snacks-biscuits', name: 'Snacks & Biscuits', aliases: ['snacks & biscuits', 'snacks and biscuits', 'snacks', 'biscuits'] },
  { id: 'cold-drinks-beverages', name: 'Cold Drinks & Beverages', aliases: ['cold drinks & beverages', 'cold drinks and beverages', 'cold drinks', 'beverages', 'beverage'] },
  { id: 'home-care', name: 'Home Care', aliases: ['home care', 'cleaning'] },
  { id: 'personal-care', name: 'Personal Care', aliases: ['personal care', 'beauty care'] },
  { id: 'bakery-breakfast', name: 'Bakery & Breakfast', aliases: ['bakery & breakfast', 'bakery and breakfast', 'bakery', 'breakfast'] },
  { id: 'stationery', name: 'Stationery', aliases: ['stationery', 'stationary', 'school supplies'] },
  { id: 'daily-essentials', name: 'Daily Essentials', aliases: ['daily essentials', 'essentials'] },
] as const;

export const MAX_STOREFRONT_CATEGORIES = STOREFRONT_CATEGORIES.length;

export type StorefrontCategory = (typeof STOREFRONT_CATEGORIES)[number];

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Resolves an API category name to one of the ten customer-facing categories. */
export function storefrontCategoryFor(name: string | null | undefined): StorefrontCategory | undefined {
  if (!name) return undefined;
  const normalized = normalise(name);
  return STOREFRONT_CATEGORIES.find((category) => category.aliases.some((alias) => normalized === alias));
}

export function storefrontCategoryById(id: string | null | undefined): StorefrontCategory | undefined {
  return STOREFRONT_CATEGORIES.find((category) => category.id === id);
}

export function isStorefrontCategory(name: string | null | undefined): boolean {
  return storefrontCategoryFor(name) !== undefined;
}

/** Keeps API categories that belong to the fixed catalogue, in its display order. */
export function storefrontCategories<T extends { name: string }>(categories: readonly T[]): T[] {
  return categories
    .filter((category) => isStorefrontCategory(category.name))
    .sort((a, b) => {
      const aIndex = STOREFRONT_CATEGORIES.indexOf(storefrontCategoryFor(a.name)!);
      const bIndex = STOREFRONT_CATEGORIES.indexOf(storefrontCategoryFor(b.name)!);
      return aIndex - bIndex;
    });
}
