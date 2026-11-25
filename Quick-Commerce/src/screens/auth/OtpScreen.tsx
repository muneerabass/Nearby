import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, Button, Input, PressableScale } from '../../components';
import { AuthLayout } from './AuthLayout';
import { useAuth } from '../../context/AuthContext';
import { validateReferralCode } from '../../services/authService';
import { colors, spacing } from '../../theme';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Otp'>;

type ReferralState = 'idle' | 'validating' | 'valid' | 'invalid';

const RESEND_COOLDOWN = 60;

export function OtpScreen({ navigation, route }: Props) {
  const { phone } = route.params;
  const { verifyOtp, sendOtp, isSubmitting } = useAuth();
  const inputRef = useRef<TextInput>(null);
  const referralRef = useRef<TextInput>(null);

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [isResending, setIsResending] = useState(false);

  const [showReferral, setShowReferral] = useState(false);
  const [referralInput, setReferralInput] = useState('');
  const [referralState, setReferralState] = useState<ReferralState>('idle');
  const [referrerName, setReferrerName] = useState<string | null>(null);

  const handleChange = useCallback((value: string) => {
    const next = value.replace(/\D/g, '').slice(0, 6);
    setOtp(next);
    if (error) setError(undefined);
  }, [error]);

  const handleSubmit = useCallback(async () => {
    if (otp.length !== 6) {
      setError('Enter the 6-digit code we sent you.');
      return;
    }
    const codeToSend = referralState === 'valid'
      ? referralInput.toUpperCase().trim()
      : undefined;
    try {
      const user = await verifyOtp(phone, otp, codeToSend);
      if (!user.name) {
        navigation.navigate('Name');
      }
      // Otherwise RootNavigator switches stacks automatically.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed. Try again.');
    }
  }, [navigation, otp, phone, referralInput, referralState, verifyOtp]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setError(undefined);
    try {
      await sendOtp(phone);
      setResendCooldown(RESEND_COOLDOWN);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resend code. Try again.');
    } finally {
      setIsResending(false);
    }
  }, [isResending, phone, resendCooldown, sendOtp]);

  const handleReferralChange = useCallback((value: string) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    setReferralInput(cleaned);
    if (cleaned.length < 8) {
      setReferralState('idle');
      setReferrerName(null);
    }
  }, []);

  const toggleReferral = useCallback(() => {
    setShowReferral((prev) => {
      if (!prev) {
        setTimeout(() => referralRef.current?.focus(), 200);
      }
      return !prev;
    });
  }, []);

  // Auto-validate when 8 chars are entered
  useEffect(() => {
    if (referralInput.length !== 8) return;
    setReferralState('validating');
    setReferrerName(null);
    const timer = setTimeout(async () => {
      try {
        const result = await validateReferralCode(referralInput);
        setReferralState('valid');
        setReferrerName(result.referrer_name);
      } catch {
        setReferralState('invalid');
        setReferrerName(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [referralInput]);

  // Countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const referralHint = referralState === 'valid'
    ? `✓ Referred by ${referrerName ?? 'a friend'}`
    : undefined;

  const referralError = referralState === 'invalid'
    ? 'Referral code not found. Check and try again.'
    : undefined;

  return (
    <AuthLayout
      title="Verify your number"
      subtitle={`We sent a 6-digit code to ${phone}.`}
      onBack={() => navigation.goBack()}
    >
      <Input
        ref={inputRef}
        label="Verification code"
        placeholder="000000"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        returnKeyType="done"
        maxLength={6}
        value={otp}
        onChangeText={handleChange}
        onSubmitEditing={handleSubmit}
        error={error}
        hint="The code is valid for 5 minutes"
      />

      {/* Referral code — sits right below OTP input, above the Verify button */}
      <View style={styles.referralSection}>
        <PressableScale
          onPress={toggleReferral}
          scaleTo={0.97}
          haptic="none"
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={showReferral ? 'Hide referral code' : 'Enter a referral code'}
          style={styles.referralToggle}
        >
          <AppText variant="caption" color="primary">
            {showReferral ? '▲  Hide referral code' : '▼  Have a referral code?'}
          </AppText>
        </PressableScale>

        {showReferral ? (
          <View style={styles.referralInputWrap}>
            <Input
              ref={referralRef}
              label="Referral code"
              placeholder="e.g. ABC2DEFG"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              maxLength={8}
              value={referralInput}
              onChangeText={handleReferralChange}
              hint={referralHint}
              error={referralError}
            />
            {referralState === 'validating' ? (
              <View style={styles.validatingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <AppText variant="caption" color="textSecondary" style={styles.validatingLabel}>
                  Checking code…
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <Button
        label="Verify"
        onPress={handleSubmit}
        loading={isSubmitting}
        style={styles.submit}
        disabled={otp.length !== 6}
      />

      <View style={styles.resendRow}>
        <AppText variant="bodySmall" color="textSecondary">
          Didn't receive it?{' '}
        </AppText>
        <PressableScale
          onPress={handleResend}
          scaleTo={resendCooldown > 0 ? 1 : 0.94}
          haptic="none"
          hitSlop={10}
          disabled={resendCooldown > 0 || isResending}
          accessibilityRole="button"
          accessibilityLabel={
            resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : 'Resend code'
          }
          style={styles.resendLink}
        >
          <AppText
            variant="bodyStrong"
            color={resendCooldown > 0 ? 'textSecondary' : 'primary'}
          >
            {isResending
              ? 'Sending…'
              : resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : 'Resend code'}
          </AppText>
        </PressableScale>
      </View>

      <View style={styles.changeRow}>
        <PressableScale
          onPress={() => navigation.goBack()}
          scaleTo={0.94}
          haptic="none"
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Change phone number"
          style={styles.changeLink}
        >
          <AppText variant="bodySmall" color="textSecondary">
            Wrong number?{' '}
            <AppText variant="bodySmall" color="primary">
              Change number
            </AppText>
          </AppText>
        </PressableScale>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  referralSection: {
    marginTop: spacing.lg,
  },
  referralToggle: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  referralInputWrap: {
    marginTop: spacing.sm,
  },
  validatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  validatingLabel: {
    marginLeft: spacing.xs,
  },
  submit: { marginTop: spacing.xl },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xxl,
  },
  resendLink: { paddingVertical: spacing.xs },
  changeRow: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  changeLink: { paddingVertical: spacing.xs },
});
