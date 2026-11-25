import React, { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AppText, Button, DeliveryOrderCard, EmptyState, InlineBanner, ReasonSheet } from '../../components';
import { useDelivery } from '../../context/DeliveryContext';
import { colors, layout, radius, spacing } from '../../theme';
import type { DeliveryStackParamList, DeliveryTabParamList } from '../../navigation/types';
import { DeliveryHeader } from './DeliveryHeader';

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<DeliveryTabParamList, 'Available'>,
  NativeStackNavigationProp<DeliveryStackParamList>
>;

const REJECT_REASONS = ['Too far', 'Vehicle problem', 'Store looks closed', 'Order too heavy'];

export function DeliveryAvailableScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { pending, hasActiveOrder, isHydrated, isRefreshing, error, refreshAll, accept, reject, isBusy } = useDelivery();

  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const handleAccept = useCallback(
    async (orderId: string) => {
      const result = await accept(orderId);
      if (result.ok) {
        navigation.navigate('Active');
      } else {
        Alert.alert('Could not accept', result.message ?? 'Please try again.');
      }
    },
    [accept, navigation],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style="dark" />
      <DeliveryHeader title="AVAILABLE ORDERS" />
      {error ? <InlineBanner message="Can’t refresh right now — this list may be out of date." actionLabel="Retry" onActionPress={() => void refreshAll()} /> : null}

      {hasActiveOrder ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.banner}>
          <Ionicons name="bicycle" size={18} color={colors.primary} />
          <AppText variant="bodySmall" color="primary" style={styles.bannerText}>
            Finish your current delivery before accepting another order.
          </AppText>
        </Animated.View>
      ) : (
        <View style={styles.summaryCard}>
          <AppText variant="captionStrong" color="textTertiary">
            READY TO PICK UP
          </AppText>
          <AppText variant="heading1">{pending.length}</AppText>
          <AppText variant="caption" color="textTertiary">
            Accept one to start delivering.
          </AppText>
        </View>
      )}

      <FlatList
        data={pending}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshAll} tintColor={colors.primary} />}
        ListEmptyComponent={
          isHydrated ? (
            <EmptyState icon="cube-outline" title="No pending orders" message="New orders at your stores will appear here." />
          ) : null
        }
        renderItem={({ item, index }) => (
          <DeliveryOrderCard
            order={item}
            index={index}
            onPress={() => navigation.navigate('DeliveryOrderDetails', { orderId: item.id })}
            footer={
              <View style={styles.actions}>
                <Button label={hasActiveOrder ? 'Busy with a delivery' : 'Accept order'} size="sm" icon={hasActiveOrder ? 'lock-closed-outline' : 'checkmark'} disabled={hasActiveOrder || isBusy(item.id)} loading={isBusy(item.id)} onPress={() => handleAccept(item.id)} style={styles.action} />
                <Button label="Reject" variant="secondary" size="sm" disabled={hasActiveOrder || isBusy(item.id)} onPress={() => setRejectingId(item.id)} style={styles.action} />
              </View>
            }
          />
        )}
      />

      <ReasonSheet
        visible={rejectingId !== null}
        title="Reject this order?"
        message="It stays available for other riders. The admin and the store can see your reason."
        confirmLabel="Reject order"
        suggestions={REJECT_REASONS}
        placeholder="Why can’t you take this order?"
        onClose={() => setRejectingId(null)}
        onSubmit={async (reason) => {
          if (!rejectingId) return null;
          const result = await reject(rejectingId, reason);
          return result.ok ? null : result.message ?? 'Could not reject this order.';
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  summaryCard: {
    marginHorizontal: layout.gutter,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginBottom: spacing.lg,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: layout.gutter,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  bannerText: { flex: 1 },
  listContent: { paddingHorizontal: layout.gutter },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
