import React, { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ErrorState } from './ErrorState';
import { NotServiceableState } from './NotServiceableState';
import { useStore } from '../context/StoreContext';
import { colors } from '../theme';
import type { MainStackParamList } from '../navigation/types';

/**
 * Renders `children` only once the pincode catalogue is ready. Otherwise shows the
 * honest state (loading, offline/server error, or "we don't deliver here") so
 * catalogue screens never fall back to a misleading "nothing found".
 */
export function CatalogGate({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { status, error, pincode, refresh } = useStore();
  const goToAddresses = useCallback(() => navigation.navigate('AddressList', { selectMode: true }), [navigation]);

  if (status === 'ready') return <>{children}</>;

  return (
    <View style={styles.center}>
      {status === 'loading' ? (
        <ActivityIndicator color={colors.primary} />
      ) : status === 'error' ? (
        <ErrorState message={error ?? undefined} onRetry={refresh} />
      ) : (
        <NotServiceableState pincode={pincode} onChangeAddress={goToAddresses} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
