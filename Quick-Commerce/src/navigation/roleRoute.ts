import type { UserRole } from '../types';

export type RoleDestination = 'Admin' | 'Delivery' | 'Vendor' | 'Main';

/**
 * Which top-level navigator a role gets. A role this build does not know (for example
 * one added on the server after this app shipped) returns null so the caller can sign
 * the user out, instead of dropping them into the customer app.
 */
export function destinationForRole(role: string | undefined | null): RoleDestination | null {
  switch (role as UserRole | undefined) {
    case 'admin':
      return 'Admin';
    case 'delivery':
      return 'Delivery';
    case 'vendor':
      return 'Vendor';
    case 'customer':
      return 'Main';
    default:
      return null;
  }
}
