import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AdminScreenHeader, AppText, Button, Input, PressableScale } from '../../components';
import { useAdmin } from '../../context/AdminContext';
import { digitsOnly } from '../../utils/validation';
import { colors, layout, radius, spacing } from '../../theme';
import type { AdminStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<AdminStackParamList>;

export function AdminDeliveryUsersScreen() {
  const navigation = useNavigation<Navigation>();
  const { activeStore, createDeliveryUser, removeDeliveryAssignment, deactivateDeliveryUser, deliveryUsers } = useAdmin();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const nameInputRef = useRef<TextInput>(null);

  const handleCreate = useCallback(async () => {
    if (!activeStore) {
      Alert.alert('No active store', 'Pick a store first from the dashboard.');
      return;
    }
    if (phone.length !== 10) {
      Alert.alert('Invalid phone', 'Phone must be 10 digits.');
      return;
    }
    setIsSubmitting(true);
    try {
      await createDeliveryUser(`+91${phone}`, name.trim() || undefined);
      setPhone('');
      setName('');
      Alert.alert('Rider added', `Linked to ${activeStore.name}.`);
    } catch (error) {
      Alert.alert('Could not add rider', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [activeStore, createDeliveryUser, name, phone]);

  const handleRemove = useCallback(async (riderId: string) => {
    setRemovingId(riderId);
    try {
      await removeDeliveryAssignment(riderId);
    } catch (error) {
      Alert.alert('Could not remove rider', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setRemovingId(null);
    }
  }, [removeDeliveryAssignment]);

  const handleDeactivate = useCallback((riderId: string, riderName: string) => {
    Alert.alert(
      'Deactivate rider?',
      `${riderName} will be unassigned from every store and their sessions will be revoked. Historical orders are preserved.`,
      [
        { text: 'Keep rider', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            setRemovingId(riderId);
            try {
              await deactivateDeliveryUser(riderId);
            } catch (error) {
              Alert.alert('Could not deactivate rider', error instanceof Error ? error.message : 'Try again.');
            } finally {
              setRemovingId(null);
            }
          },
        },
      ],
    );
  }, [deactivateDeliveryUser]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <PressableScale onPress={() => navigation.goBack()} scaleTo={0.9} haptic="none" style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </PressableScale>
        <AdminScreenHeader title="Delivery riders" subtitle={activeStore ? `Will be assigned to ${activeStore.name}` : 'Pick an active store first'} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <AppText variant="heading3" style={styles.cardTitle}>
              Add delivery agent
            </AppText>
            <Input
              label="Phone"
              prefix="+91"
              value={phone}
              onChangeText={(v) => setPhone(digitsOnly(v))}
              keyboardType="number-pad"
              maxLength={10}
              returnKeyType="next"
              onSubmitEditing={() => nameInputRef.current?.focus()}
            />
            <Input
              ref={nameInputRef}
              label="Name (optional)"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <Button
              label="Add rider"
              onPress={handleCreate}
              loading={isSubmitting}
              disabled={!activeStore}
              style={styles.submit}
            />
          </View>

          <AppText variant="caption" color="textTertiary" style={styles.hint}>
            Role is set to delivery automatically. The agent logs in via OTP with this number.
          </AppText>

          <AppText variant="heading3" style={styles.sectionTitle}>
            Riders at this store
          </AppText>
          {deliveryUsers.length === 0 ? (
            <AppText variant="caption" color="textTertiary" style={styles.empty}>
              No riders assigned yet.
            </AppText>
          ) : (
            deliveryUsers.map((rider) => (
              <View key={rider.id} style={styles.riderRow}>
                <View style={styles.riderInfo}>
                  <AppText variant="bodyStrong">{rider.name ?? rider.phone}</AppText>
                  {rider.name ? <AppText variant="caption" color="textSecondary">{rider.phone}</AppText> : null}
                </View>
                <View style={styles.riderActions}>
                  <PressableScale
                    onPress={() => handleRemove(rider.id)}
                    scaleTo={0.9}
                    haptic="none"
                    style={styles.removeButton}
                    disabled={removingId === rider.id}
                    accessibilityLabel="Unassign rider from this store"
                  >
                    {removingId === rider.id
                      ? <ActivityIndicator size="small" color={colors.error} />
                      : <Ionicons name="link-outline" size={18} color={colors.warning} />}
                  </PressableScale>
                  <PressableScale
                    onPress={() => handleDeactivate(rider.id, rider.name ?? rider.phone)}
                    scaleTo={0.9}
                    haptic="none"
                    style={styles.removeButton}
                    disabled={removingId === rider.id}
                    accessibilityLabel="Deactivate rider"
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </PressableScale>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', paddingHorizontal: layout.gutter, paddingTop: spacing.lg, gap: spacing.md },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing.lg, paddingBottom: spacing.huge },
  card: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { marginBottom: spacing.md },
  submit: { marginTop: spacing.md },
  hint: { marginTop: spacing.lg, lineHeight: 18 },
  sectionTitle: { marginTop: spacing.xxl, marginBottom: spacing.md },
  empty: { lineHeight: 18 },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  riderInfo: { flex: 1 },
  riderActions: { flexDirection: 'row', alignItems: 'center' },
  removeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
