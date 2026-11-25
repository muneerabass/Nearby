import 'react-native-gesture-handler';
import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, useFonts } from '@expo-google-fonts/manrope';
import { AuthProvider } from '../Quick-Commerce/src/context/AuthContext';
import { DeliveryPartnerRootNavigator } from './src/DeliveryPartnerRootNavigator';

export default function App() {
  const [loaded, fontError] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  if (!loaded && !fontError) return null;
  return <GestureHandlerRootView style={styles.root}><SafeAreaProvider><AuthProvider><DeliveryPartnerRootNavigator /></AuthProvider></SafeAreaProvider></GestureHandlerRootView>;
}
const styles = StyleSheet.create({ root: { flex: 1 } });
