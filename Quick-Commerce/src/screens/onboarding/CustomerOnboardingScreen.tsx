import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import { AppText, Button, Input, PressableScale } from '../../components';
import { AuthLayout } from '../auth/AuthLayout';
import { useAuth } from '../../context/AuthContext';
import * as addressService from '../../services/addressService';
import { productsForPincode } from '../../services/catalogService';
import { getErrorMessage } from '../../utils/errors';
import { validatePincode, validatePhone } from '../../utils/validation';
import { colors, spacing } from '../../theme';

type Step = 'welcome' | 'address';

export function CustomerOnboardingScreen() {
  const { user, completeOnboarding } = useAuth();
  const [step, setStep] = useState<Step>('welcome');
  const [recipientName, setRecipientName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState((user?.phone ?? '').replace(/^\+91/, ''));
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceable, setServiceable] = useState<boolean | null>(null);
  const [checkedPincode, setCheckedPincode] = useState('');
  const [error, setError] = useState<string | undefined>();

  const verifyPincode = useCallback(async (value = pincode): Promise<boolean> => {
    const clean = value.trim();
    const validationError = validatePincode(clean);
    if (validationError) {
      setError(validationError);
      setServiceable(null);
      return false;
    }
    setIsChecking(true);
    setError(undefined);
    try {
      const result = await productsForPincode(clean);
      setServiceable(result.serviceable);
      setCheckedPincode(clean);
      if (!result.serviceable) {
        setError(`We do not deliver to ${clean} yet. Try another pincode.`);
      }
      return result.serviceable;
    } catch (e) {
      setServiceable(null);
      setCheckedPincode('');
      setError(getErrorMessage(e, 'Could not check this pincode. Check your connection and retry.'));
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [pincode]);

  const useCurrentLocation = useCallback(async () => {
    setIsLocating(true);
    setError(undefined);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Location access was denied. Enter your pincode manually to continue.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const results = await Location.reverseGeocodeAsync(position.coords);
      const hit = results[0];
      if (hit?.postalCode) {
        setPincode(hit.postalCode.replace(/\D/g, '').slice(0, 6));
        setCity(hit.city ?? hit.district ?? '');
        setState(hit.region ?? '');
        setServiceable(null);
        setCheckedPincode('');
        setError('Location found. Verify delivery availability for this pincode.');
      } else {
        setError('We could not read a pincode from your location. Enter it manually.');
      }
    } catch (e) {
      setError(getErrorMessage(e, 'Could not get your location. You can enter the pincode manually.'));
    } finally {
      setIsLocating(false);
    }
  }, []);

  const submit = useCallback(async () => {
    if (!recipientName.trim() || !addressLine1.trim() || !city.trim() || !state.trim()) {
      setError('Enter your name, address, city, and state.');
      return;
    }
    const phoneError = validatePhone(phone);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    const cleanPincode = pincode.trim();
    if (validatePincode(cleanPincode)) {
      setError(validatePincode(cleanPincode));
      return;
    }
    let isAvailable = serviceable === true && checkedPincode === cleanPincode;
    if (!isAvailable) isAvailable = await verifyPincode(cleanPincode);
    if (!isAvailable) return;

    setIsSubmitting(true);
    setError(undefined);
    try {
      await addressService.createAddress({
        label: 'Home',
        recipient_name: recipientName.trim(),
        phone: `+91${phone}`,
        address_line1: addressLine1.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: cleanPincode,
        is_default: true,
      });
      completeOnboarding();
    } catch (e) {
      setError(getErrorMessage(e, 'Could not save your address. Please retry.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [addressLine1, checkedPincode, city, completeOnboarding, phone, pincode, recipientName, serviceable, state, verifyPincode]);

  if (step === 'welcome') {
    return (
      <AuthLayout title={`Welcome to Emblem, ${user?.name ?? ''}`.trim()} subtitle="Your everyday essentials, delivered quickly from stores near you.">
        <View style={styles.points}>
          <AppText variant="body" style={styles.point}>⚡ Fast delivery from nearby stores</AppText>
          <AppText variant="body" style={styles.point}>📍 Choose exactly where we should deliver</AppText>
          <AppText variant="body" style={styles.point}>🛒 Fresh groceries and household essentials</AppText>
        </View>
        <Button label="Set delivery location" onPress={() => setStep('address')} style={styles.primaryButton} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Where should we deliver?"
      subtitle="Add your first address so we can show stores and products available near you."
      onBack={() => setStep('welcome')}
    >
      <PressableScale onPress={useCurrentLocation} disabled={isLocating} style={styles.locationButton}>
        {isLocating ? <ActivityIndicator color={colors.primary} /> : <AppText variant="button" color="primary">Use my current location</AppText>}
      </PressableScale>
      <AppText variant="caption" color="textSecondary" style={styles.locationHint}>
        Location permission is optional. You can enter your pincode manually.
      </AppText>

      <Input label="Your name" value={recipientName} onChangeText={setRecipientName} autoCapitalize="words" />
      <Input label="Phone" prefix="+91" value={phone} onChangeText={(value) => setPhone(value.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" maxLength={10} />
      <Input label="Address" value={addressLine1} onChangeText={setAddressLine1} placeholder="House / flat / street" />
      <Input label="City" value={city} onChangeText={setCity} />
      <Input label="State" value={state} onChangeText={setState} />
      <Input
        label="Pincode"
        value={pincode}
        onChangeText={(value) => {
          setPincode(value.replace(/\D/g, '').slice(0, 6));
          setServiceable(null);
          setCheckedPincode('');
          setError(undefined);
        }}
        keyboardType="number-pad"
        maxLength={6}
        error={error}
      />
      <Button label="Check availability" onPress={() => void verifyPincode()} loading={isChecking} style={styles.secondaryButton} />
      {serviceable === true && checkedPincode === pincode.trim() ? (
        <AppText variant="caption" color="primary" style={styles.success}>Great — Emblem delivers here.</AppText>
      ) : null}
      <Button label="Start shopping" onPress={() => void submit()} loading={isSubmitting} style={styles.primaryButton} disabled={isChecking} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  points: { gap: spacing.lg },
  point: { lineHeight: 24 },
  primaryButton: { marginTop: spacing.xxl },
  secondaryButton: { marginTop: spacing.md },
  locationButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  locationHint: { marginTop: spacing.sm, marginBottom: spacing.lg },
  success: { marginTop: spacing.sm },
});
