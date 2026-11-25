import type { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme';

/**
 * Pure cosmetics for category tiles. The backend only stores category name and id;
 * icon + tint are a client-side look-up by (lower-case) name. "default" wins when
 * a category hasn't been styled yet, so new categories always have *some* look.
 */

export type CategoryIconName = keyof typeof MaterialCommunityIcons.glyphMap;

export interface CategoryLook {
  icon: CategoryIconName;
  /** Soft tile background. */
  tint: string;
  /** Icon colour, a deeper shade of the tint. */
  color: string;
}

const DEFAULT: CategoryLook = { icon: 'shopping-outline', tint: colors.surfaceMuted, color: colors.textSecondary };

const GREEN = { tint: '#E7F7E9', color: '#1E8E4E' };
const RED = { tint: '#FBE9EC', color: '#D03A55' };
const BLUE = { tint: '#EAF2FB', color: '#2F6FC4' };
const AMBER = { tint: '#FBF0E0', color: '#C47A12' };
const TEAL = { tint: '#E6F2F3', color: '#1B8A94' };
const PURPLE = { tint: '#EEEAFB', color: '#5B21E8' };
const PINK = { tint: '#FBEAF2', color: '#C2378A' };

const LOOKS: Record<string, CategoryLook> = {
  grocery: { icon: 'basket-outline', ...GREEN },
  groceries: { icon: 'basket-outline', ...GREEN },
  'grocery & staples': { icon: 'basket-outline', ...GREEN },
  'fruits & vegetables': { icon: 'food-apple-outline', ...RED },
  dairy: { icon: 'cup-water', ...BLUE },
  'dairy & eggs': { icon: 'cup-water', ...BLUE },
  bakery: { icon: 'bread-slice-outline', ...AMBER },
  'bakery & breakfast': { icon: 'bread-slice-outline', ...AMBER },
  beverages: { icon: 'bottle-soda-classic-outline', ...TEAL },
  'cold drinks & beverages': { icon: 'bottle-soda-classic-outline', ...TEAL },
  snacks: { icon: 'cookie-outline', ...AMBER },
  'snacks & biscuits': { icon: 'cookie-outline', ...AMBER },
  'home care': { icon: 'spray-bottle', ...PURPLE },
  'personal care': { icon: 'lotion-outline', ...PINK },
  stationery: { icon: 'pencil-ruler-outline', ...PURPLE },
  'daily essentials': { icon: 'shopping-outline', ...TEAL },
  frozen: { icon: 'snowflake', ...TEAL },
  pharmacy: { icon: 'pill', ...RED },
  pet: { icon: 'paw-outline', ...PURPLE },
};

export function lookForCategory(name: string | null | undefined): CategoryLook {
  if (!name) return DEFAULT;
  return LOOKS[name.trim().toLowerCase()] ?? DEFAULT;
}
