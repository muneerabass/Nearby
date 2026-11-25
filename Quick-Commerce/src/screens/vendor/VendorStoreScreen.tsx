import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AdminScreenHeader, AppText, Button, InlineBanner, Input, PressableScale } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useVendor } from '../../context/VendorContext';
import { useFocusedPolling } from '../../hooks/useFocusedPolling';
import * as vendorService from '../../services/vendorService';
import { User } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { minutesAgo } from '../../utils/orderStatus';
import { colors, layout, radius, shadows, spacing } from '../../theme';

export function VendorStoreScreen() {
  const insets = useSafeAreaInsets();
  const { logout, user } = useAuth();
  const { store, setOpen, saveContactPhone, refresh } = useVendor();
  const [riders, setRiders] = useState<User[] | null>(null);
  const [ridersError, setRidersError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [savingPhone, setSavingPhone] = useState(false);
  const [togglingOpen, setTogglingOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => setPhone(store?.contact_phone ?? ''), [store?.contact_phone]);

  const loadRiders = useCallback(async (): Promise<boolean> => {
    try {
      setRiders(await vendorService.listRiders());
      setRidersError(null);
      return true;
    } catch (e) {
      setRidersError(getErrorMessage(e, 'Could not load riders.'));
      return false;
    }
  }, []);

  useFocusedPolling(() => loadRiders(), 30_000);

  const lockedByAdmin = !!store && !store.is_active && store.closed_by_role === 'admin';

  const toggleOpen = useCallback(
    async (next: boolean) => {
      if (!next) {
        const confirmed = await new Promise<boolean>((resolve) =>
          Alert.alert('Close the store?', 'Customers will not be able to place new orders. Orders already placed continue as normal.', [
            { text: 'Keep open', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Close store', style: 'destructive', onPress: () => resolve(true) },
          ]),
        );
        if (!confirmed) return;
      }
      setTogglingOpen(true);
      const result = await setOpen(next);
      setTogglingOpen(false);
      if (!result.ok) Alert.alert(result.code === 'store_closed_by_admin' ? 'Closed by admin' : 'Could not update the store', result.message ?? 'Try again.');
    },
    [setOpen],
  );

  const savePhone = useCallback(async () => {
    setPhoneError(undefined);
    setSavingPhone(true);
    const result = await saveContactPhone(phone);
    setSavingPhone(false);
    if (!result.ok) setPhoneError(result.message);
  }, [phone, saveContactPhone]);

  const confirmLogout = useCallback(() => {
    Alert.alert('Log out?', 'You can sign back in with your phone number any time.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void logout() },
    ]);
  }, [logout]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={async () => { setIsRefreshing(true); await Promise.all([refresh(), loadRiders()]); setIsRefreshing(false); }} tintColor={colors.primary} />}
      >
        <AdminScreenHeader eyebrow="ZIPP VENDOR" title="My store" subtitle={`Signed in as ${user?.name ?? 'vendor'}`} />

        {store ? (
          <>
            <View style={styles.card}>
              <AppText variant="heading3">{store.name}</AppText>
              <AppText variant="bodySmall" color="textSecondary">{store.address}</AppText>
              <View style={styles.pincodes}>
                {store.pincodes.map((pin) => (
                  <View key={pin} style={styles.pin}><AppText variant="captionStrong" color="textSecondary">{pin}</AppText></View>
                ))}
              </View>
              <AppText variant="caption" color="textTertiary">The name, address and delivery pincodes are managed by the admin.</AppText>
            </View>

            <View style={[styles.card, styles.openRow]}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{store.is_active ? 'Store is open' : 'Store is closed'}</AppText>
                <AppText variant="caption" color="textSecondary">
                  {lockedByAdmin ? 'An administrator closed this store. Contact support to reopen it.' : store.is_active ? 'Customers can order from you.' : 'Customers cannot place new orders.'}
                </AppText>
              </View>
              <Switch
                value={store.is_active}
                onValueChange={(next) => void toggleOpen(next)}
                disabled={togglingOpen || lockedByAdmin}
                trackColor={{ true: colors.primary, false: colors.borderStrong }}
                accessibilityLabel="Store open"
              />
            </View>

            <View style={styles.card}>
              <Input
                label="Store contact number"
                optional
                value={phone}
                onChangeText={(v) => { setPhone(v); setPhoneError(undefined); }}
                keyboardType="phone-pad"
                placeholder="+919876543210"
                error={phoneError}
                hint="Shown to riders and the admin."
              />
              <Button label="Save number" variant="secondary" size="sm" onPress={() => void savePhone()} loading={savingPhone} disabled={phone.trim() === (store.contact_phone ?? '')} />
            </View>
          </>
        ) : null}

        <AppText variant="heading3" style={styles.section}>Riders for your store</AppText>
        {ridersError ? <InlineBanner message={ridersError} actionLabel="Retry" onActionPress={() => void loadRiders()} /> : null}
        <View style={styles.card}>
          {riders && riders.length === 0 ? (
            <AppText variant="bodySmall" color="textSecondary">No riders are assigned yet. Ask the admin to assign riders to your store.</AppText>
          ) : (
            (riders ?? []).map((rider) => (
              <View key={rider.id} style={styles.riderRow}>
                <View style={[styles.dot, { backgroundColor: rider.is_online ? colors.success : colors.borderStrong }]} />
                <View style={styles.flex}>
                  <AppText variant="bodySmall">{rider.name ?? rider.phone}</AppText>
                  <AppText variant="caption" color="textTertiary">{rider.is_online ? 'Online' : rider.last_seen_at ? `Offline · seen ${minutesAgo(rider.last_seen_at)}` : 'Offline'}</AppText>
                </View>
              </View>
            ))
          )}
        </View>

        <PressableScale onPress={confirmLogout} style={styles.logout} haptic="none">
          <Ionicons name="log-out-outline" size={19} color={colors.error} />
          <AppText variant="button" color="error" style={styles.logoutLabel}>Log out</AppText>
        </PressableScale>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing.lg },
  flex: { flex: 1 },
  card: { marginBottom: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, ...shadows.soft },
  pincodes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.sm },
  pin: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill, backgroundColor: colors.canvas },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  section: { marginTop: spacing.lg, marginBottom: spacing.sm },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  logout: { marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.errorSoft },
  logoutLabel: { marginLeft: spacing.sm },
});
