import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Central route map. Screens read their params through these types, so adding
 * a new screen is a one-line change here plus the navigator entry.
 */

export type MainTabParamList = {
  Home: undefined;
  Categories: undefined;
  Cart: undefined;
  Profile: undefined;
};

export type MainStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList>;
  Search: { initialQuery?: string } | undefined;
  ProductDetails: { productId: string };
  CategoryProducts: { categoryId?: string | null; categoryKey?: string };
  AddressList: { selectMode?: boolean } | undefined;
  AddressForm: { addressId?: string; selectMode?: boolean } | undefined;
  AddressMapPicker: {
    initialLatitude?: number;
    initialLongitude?: number;
  };
  OrderList: undefined;
  OrderDetails: { orderId: string };
};

export type AuthStackParamList = {
  Login: undefined;
  Otp: { phone: string };
  Name: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Onboarding: undefined;
  Main: NavigatorScreenParams<MainStackParamList>;
  Admin: NavigatorScreenParams<AdminStackParamList>;
  Delivery: NavigatorScreenParams<DeliveryStackParamList>;
  Vendor: NavigatorScreenParams<VendorStackParamList>;
};

/** Which list the admin orders screen opens on. */
export type AdminOrdersTab = 'open' | 'attention' | 'history' | 'all';

export type AdminTabParamList = {
  Dashboard: undefined;
  Inventory: undefined;
  Catalog: undefined;
  More: undefined;
};

export type AdminStackParamList = {
  AdminTabs: NavigatorScreenParams<AdminTabParamList>;
  AdminOrderDetails: { orderId: string };
  ProductForm: { productId?: string } | undefined;
  Categories: undefined;
  Stores: undefined;
  Orders: { tab?: AdminOrdersTab } | undefined;
  StoreForm: { storeId?: string } | undefined;
  DeliveryUsers: undefined;
  Customers: undefined;
};

export type VendorTabParamList = {
  VendorOrders: undefined;
  VendorDashboard: undefined;
  VendorCatalog: undefined;
  VendorStore: undefined;
};

export type VendorStackParamList = {
  VendorTabs: NavigatorScreenParams<VendorTabParamList> | undefined;
  VendorOrderDetails: { orderId: string };
  VendorProductForm: { productId?: string } | undefined;
};

export type DeliveryTabParamList = {
  Available: undefined;
  Active: undefined;
  History: undefined;
  Profile: undefined;
};

export type DeliveryStackParamList = {
  DeliveryTabs: NavigatorScreenParams<DeliveryTabParamList> | undefined;
  DeliveryOrderDetails: { orderId: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
