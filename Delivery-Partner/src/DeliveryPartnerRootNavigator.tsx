import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { AuthNavigator } from '../../Quick-Commerce/src/navigation/AuthNavigator';
import { DeliveryNavigator } from '../../Quick-Commerce/src/navigation/DeliveryNavigator';
import { useAuth } from '../../Quick-Commerce/src/context/AuthContext';
import { colors } from '../../Quick-Commerce/src/theme';

const Stack = createNativeStackNavigator();
export function DeliveryPartnerRootNavigator() {
  const { isBootstrapping, isAuthenticated, user, logout } = useAuth();
  const [checked, setChecked] = useState(false);
  useEffect(() => { if (isAuthenticated && user && user.role !== 'delivery') { void logout(); } else if (!isBootstrapping) setChecked(true); }, [isAuthenticated, isBootstrapping, logout, user]);
  return <NavigationContainer theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: colors.primary, background: colors.background, card: colors.surface, text: colors.text, border: colors.border } }}><Stack.Navigator screenOptions={{ headerShown: false }}>{isBootstrapping || !checked ? <Stack.Screen name="Boot"><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View></Stack.Screen> : isAuthenticated && user?.role === 'delivery' ? <Stack.Screen name="Delivery" component={DeliveryNavigator} /> : <Stack.Screen name="Auth" component={AuthNavigator} />}</Stack.Navigator></NavigationContainer>;
}
