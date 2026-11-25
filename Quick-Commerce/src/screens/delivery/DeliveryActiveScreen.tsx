import React, { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Button, DeliveryCodeSheet, DeliveryOrderCard, EmptyState, InlineBanner } from '../../components';
import { useDelivery } from '../../context/DeliveryContext';
import { Order } from '../../types';
import { colors, layout, spacing } from '../../theme';
import type { DeliveryStackParamList, DeliveryTabParamList } from '../../navigation/types';
import { DeliveryHeader } from './DeliveryHeader';

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<DeliveryTabParamList, 'Active'>,
  NativeStackNavigationProp<DeliveryStackParamList>
>;

export function DeliveryActiveScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { active, isHydrated, isRefreshing, error, refreshAll, complete, pickup, outForDelivery, isBusy } = useDelivery();
  const [handingOver, setHandingOver] = useState<Order | null>(null);

  // Returns an inline error for the sheet, or null once the order is delivered.
  const submitCode = useCallback(
    async (code: string): Promise<string | null> => {
      if (!handingOver) return null;
      const result = await complete(handingOver.id, code);
      if (result.ok) return null;
      if (result.code === 'delivery_code_locked') {
        setHandingOver(null);
        Alert.alert('Too many wrong codes', result.message ?? 'Ask support to complete this order.');
        return null;
      }
      return result.message ?? 'Could not complete this order.';
    },
    [complete, handingOver],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style="dark" />
      <DeliveryHeader title="ACTIVE DELIVERY" />
      {error ? <InlineBanner message="Can’t refresh right now — showing your last known deliveries." actionLabel="Retry" onActionPress={() => void refreshAll()} /> : null}

      <FlatList
        data={active}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshAll} tintColor={colors.primary} />}
        ListEmptyComponent={
          isHydrated ? (
            <EmptyState
              icon="bicycle-outline"
              title="No active delivery"
              message="Accept an order from the Available tab to start."
            />
          ) : null
        }
        renderItem={({ item, index }) => (
          <DeliveryOrderCard
            order={item}
            index={index}
            onPress={() => navigation.navigate('DeliveryOrderDetails', { orderId: item.id })}
            footer={
              <View style={styles.actions}>
                <Button
                  label="Details & navigate"
                  variant="secondary"
                  size="sm"
                  icon="navigate-outline"
                  onPress={() => navigation.navigate('DeliveryOrderDetails', { orderId: item.id })}
                  style={styles.action}
                />
                <Button
                  label={item.status === 'accepted' ? 'Confirm pickup' : item.status === 'picked_up' ? 'Start delivery' : 'Mark delivered'}
                  size="sm"
                  icon="checkmark-done"
                  disabled={isBusy(item.id)}
                  onPress={() => {
                    if (item.status === 'accepted') void pickup(item.id).then((result) => { if (!result.ok) Alert.alert('Could not confirm pickup', result.message ?? 'Try again.'); });
                    else if (item.status === 'picked_up') void outForDelivery(item.id).then((result) => { if (!result.ok) Alert.alert('Could not start delivery', result.message ?? 'Try again.'); });
                    else setHandingOver(item);
                  }}
                  style={styles.action}
                />
              </View>
            }
          />
        )}
      />
      <DeliveryCodeSheet
        visible={handingOver != null}
        amountToCollect={handingOver?.amount_to_collect ?? 0}
        onClose={() => setHandingOver(null)}
        onSubmit={submitCode}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
