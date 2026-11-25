import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Input, PincodeInput, PressableScale, Screen } from '../../components';
import { useAdmin } from '../../context/AdminContext';
import * as adminService from '../../services/adminService';
import { getErrorMessage } from '../../utils/errors';
import { colors, layout, radius, spacing } from '../../theme';
import type { AdminStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AdminStackParamList, 'StoreForm'>;

interface FormState {
  name: string;
  address: string;
  pincodes: string[];
  isActive: boolean;
  contactPhone: string;
  vendorName: string;
  vendorPhone: string;
}

type FormErrors = Partial<Record<'name' | 'address' | 'pincodes' | 'contactPhone' | 'vendorPhone', string>>;

const EMPTY: FormState = { name: '', address: '', pincodes: [], isActive: true, contactPhone: '', vendorName: '', vendorPhone: '' };

/** Admins type local numbers; the API wants +country code. A bare 10-digit number is Indian. */
function toE164(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  return digits.length === 10 ? `+91${digits}` : digits.length === 12 && digits.startsWith('91') ? `+${digits}` : trimmed;
}

const PHONE_PATTERN = /^\+[1-9][0-9]{7,14}$/;

export function AdminStoreFormScreen({ navigation, route }: Props) {
  const editingId = route.params?.storeId;
  const { stores, saveStore, archiveStore, refresh } = useAdmin();
  const existing = editingId ? stores.find((s) => s.id === editingId) : undefined;

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isSavingVendor, setIsSavingVendor] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setForm({
      name: existing.name,
      address: existing.address,
      pincodes: existing.pincodes ?? [],
      isActive: existing.is_active,
      contactPhone: existing.contact_phone ?? '',
      vendorName: existing.vendor?.name ?? '',
      vendorPhone: existing.vendor?.phone ?? '',
    });
  }, [existing]);

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  const handleSubmit = useCallback(async () => {
    const next: FormErrors = {};
    if (!form.name.trim()) next.name = 'Store name is required';
    if (!form.address.trim()) next.address = 'Address is required';
    if (form.pincodes.length === 0) next.pincodes = 'Add at least one serviceable pincode';
    const contact = toE164(form.contactPhone);
    if (contact && !PHONE_PATTERN.test(contact)) next.contactPhone = 'Enter a valid phone number';
    const vendorPhone = toE164(form.vendorPhone);
    if (!existing && vendorPhone && !PHONE_PATTERN.test(vendorPhone)) next.vendorPhone = 'Enter a valid phone number';
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      return;
    }
    setIsSubmitting(true);
    try {
      const saved = await saveStore(
        {
          name: form.name.trim(),
          address: form.address.trim(),
          pincodes: form.pincodes,
          is_active: form.isActive,
          contact_phone: contact || null,
          ...(!existing && vendorPhone ? { vendor: { phone: vendorPhone, name: form.vendorName.trim() || null } } : {}),
        },
        existing?.id,
      );
      if (saved?.open_orders) {
        Alert.alert(
          'Store deactivated',
          `${saved.open_orders} open order${saved.open_orders === 1 ? '' : 's'} will still be delivered. Customers can’t place new ones.`,
        );
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not save store', getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }, [existing?.id, form, navigation, saveStore]);

  const saveVendor = useCallback(async () => {
    if (!existing) return;
    const phone = toE164(form.vendorPhone);
    if (!PHONE_PATTERN.test(phone)) {
      setErrors((prev) => ({ ...prev, vendorPhone: 'Enter a valid phone number' }));
      return;
    }
    setIsSavingVendor(true);
    try {
      await adminService.setStoreVendor(existing.id, { phone, name: form.vendorName.trim() || null });
      await refresh();
      Alert.alert('Vendor saved', `${phone} can now sign in with this number and manage ${existing.name}.`);
    } catch (error) {
      Alert.alert('Could not save vendor', getErrorMessage(error));
    } finally {
      setIsSavingVendor(false);
    }
  }, [existing, form.vendorName, form.vendorPhone, refresh]);

  const removeVendor = useCallback(() => {
    if (!existing?.vendor) return;
    Alert.alert('Remove this vendor?', `${existing.vendor.name ?? existing.vendor.phone} will be signed out and lose access to ${existing.name}. Their phone number stays a normal customer account.`, [
      { text: 'Keep vendor', style: 'cancel' },
      {
        text: 'Remove vendor',
        style: 'destructive',
        onPress: async () => {
          setIsSavingVendor(true);
          try {
            await adminService.removeStoreVendor(existing.id);
            await refresh();
            setForm((prev) => ({ ...prev, vendorName: '', vendorPhone: '' }));
          } catch (error) {
            Alert.alert('Could not remove vendor', getErrorMessage(error));
          } finally {
            setIsSavingVendor(false);
          }
        },
      },
    ]);
  }, [existing, refresh]);

  const confirmArchive = useCallback(() => {
    if (!existing) return;
    Alert.alert(
      'Archive this store?',
      `“${existing.name}” will stop accepting new orders. Existing orders and history are preserved.`,
      [
        { text: 'Keep store', style: 'cancel' },
        {
          text: 'Archive store',
          style: 'destructive',
          onPress: async () => {
            setIsArchiving(true);
            try {
              await archiveStore(existing.id);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Could not archive store', getErrorMessage(error));
            } finally {
              setIsArchiving(false);
            }
          },
        },
      ],
    );
  }, [archiveStore, existing, navigation]);

  return (
    <Screen keyboard>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <PressableScale onPress={() => navigation.goBack()} scaleTo={0.9} haptic="none" style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </PressableScale>
        <AppText variant="heading2" style={styles.title}>
          {existing ? 'Edit store' : 'Add store'}
        </AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Input label="Name" value={form.name} onChangeText={(v) => update('name', v)} error={errors.name} />
        <Input label="Address" value={form.address} onChangeText={(v) => update('address', v)} error={errors.address} />

        <Input
          label="Store contact number"
          optional
          value={form.contactPhone}
          onChangeText={(v) => update('contactPhone', v)}
          error={errors.contactPhone}
          keyboardType="phone-pad"
          placeholder="+919876543210"
          hint="Shown to riders and admin."
        />

        <PincodeInput
          value={form.pincodes}
          onChange={(v) => update('pincodes', v)}
          error={errors.pincodes}
          hint="Customers with these pincodes will see this store’s products."
        />

          <View style={styles.vendorCard}>
            <AppText variant="heading3">Store vendor</AppText>
            <AppText variant="caption" color="textSecondary" style={styles.vendorHint}>
              The person who runs this store. They sign in with this phone number and manage orders, stock and products for this store only.
            </AppText>
            <Input label="Vendor name" optional value={form.vendorName} onChangeText={(v) => update('vendorName', v)} />
            <Input
              label="Vendor phone"
              optional={!existing}
              value={form.vendorPhone}
              onChangeText={(v) => update('vendorPhone', v)}
              error={errors.vendorPhone}
              keyboardType="phone-pad"
              placeholder="+919876543210"
            />
            {existing ? (
              <View style={styles.vendorActions}>
                <Button
                  label={existing.vendor ? 'Save vendor' : 'Add vendor'}
                  size="sm"
                  variant="secondary"
                  loading={isSavingVendor}
                  disabled={!form.vendorPhone.trim() || (toE164(form.vendorPhone) === existing.vendor?.phone && form.vendorName.trim() === (existing.vendor?.name ?? ''))}
                  onPress={() => void saveVendor()}
                  style={styles.vendorAction}
                />
                {existing.vendor ? <Button label="Remove" size="sm" variant="danger" disabled={isSavingVendor} onPress={removeVendor} style={styles.vendorAction} /> : null}
              </View>
            ) : null}
            {existing?.vendor && existing.vendor.status !== 'active' ? <AppText variant="caption" color="error">This vendor’s account is {existing.vendor.status}.</AppText> : null}
          </View>

          <PressableScale
            onPress={() => update('isActive', !form.isActive)}
            scaleTo={0.98}
            haptic="none"
            style={[styles.toggle, form.isActive && styles.toggleActive]}
          >
            <Ionicons name={form.isActive ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={form.isActive ? colors.primary : colors.textSecondary} />
            <AppText variant="button" color={form.isActive ? 'primary' : 'textSecondary'} style={styles.toggleLabel}>
              Active
            </AppText>
          </PressableScale>

          <Button
            label={existing ? 'Save changes' : 'Create store'}
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isArchiving}
            style={styles.submit}
          />
          {existing ? (
            <Button
              label="Archive store"
              onPress={confirmArchive}
              variant="danger"
              loading={isArchiving}
              disabled={isSubmitting}
              icon="trash-outline"
              accessibilityHint="Stops new orders while preserving store history"
              style={styles.deleteButton}
            />
          ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.gutter, paddingVertical: spacing.lg },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  title: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xxxl },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
    marginBottom: spacing.lg,
  },
  toggleActive: { backgroundColor: colors.primarySoft },
  toggleLabel: { marginLeft: spacing.sm },
  submit: { marginTop: spacing.md },
  vendorCard: { marginBottom: spacing.lg, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  vendorHint: { marginTop: spacing.xs, marginBottom: spacing.md },
  vendorActions: { flexDirection: 'row', gap: spacing.sm },
  vendorAction: { flex: 1 },
  deleteButton: { marginTop: spacing.md },
});
