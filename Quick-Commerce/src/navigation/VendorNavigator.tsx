import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { VendorProvider } from '../context/VendorContext';
import { VendorOrdersScreen } from '../screens/vendor/VendorOrdersScreen';
import { VendorDashboardScreen } from '../screens/vendor/VendorDashboardScreen';
import { VendorCatalogScreen } from '../screens/vendor/VendorCatalogScreen';
import { VendorStoreScreen } from '../screens/vendor/VendorStoreScreen';
import { VendorOrderDetailsScreen } from '../screens/vendor/VendorOrderDetailsScreen';
import { VendorProductFormScreen } from '../screens/vendor/VendorProductFormScreen';
import { VendorTabBar } from './VendorTabBar';
import { colors } from '../theme';
import type { VendorStackParamList, VendorTabParamList } from './types';

const Stack = createNativeStackNavigator<VendorStackParamList>();
const Tab = createBottomTabNavigator<VendorTabParamList>();

function VendorTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
      tabBar={(props) => <VendorTabBar {...props} />}
    >
      <Tab.Screen name="VendorOrders" component={VendorOrdersScreen} options={{ title: 'Orders' }} />
      <Tab.Screen name="VendorDashboard" component={VendorDashboardScreen} options={{ title: 'Insights' }} />
      <Tab.Screen name="VendorCatalog" component={VendorCatalogScreen} options={{ title: 'Catalog' }} />
      <Tab.Screen name="VendorStore" component={VendorStoreScreen} options={{ title: 'Store' }} />
    </Tab.Navigator>
  );
}

export function VendorNavigator() {
  return (
    <VendorProvider>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="VendorTabs" component={VendorTabs} />
        <Stack.Screen name="VendorOrderDetails" component={VendorOrderDetailsScreen} />
        <Stack.Screen name="VendorProductForm" component={VendorProductFormScreen} />
      </Stack.Navigator>
    </VendorProvider>
  );
}
