import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Button } from './Button';
import { Input } from './Input';
import { formatPrice } from '../utils/price';
import { digitsOnly } from '../utils/validation';
import { colors, radius, spacing } from '../theme';

interface DeliveryCodeSheetProps {
  visible: boolean;
  /** Cash to take at the door, in paise. */
  amountToCollect: number;
  onClose: () => void;
  /** Resolves with an error message to show inline, or null on success. */
  onSubmit: (code: string) => Promise<string | null>;
}

/** Rider hand-over step: collect the cash, then enter the code the customer shows. */
export function DeliveryCodeSheet({ visible, amountToCollect, onClose, onSubmit }: DeliveryCodeSheetProps) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setCode('');
      setError(undefined);
    }
  }, [visible]);

  const submit = async () => {
    if (code.length !== 6) {
      setError('Enter the 6-digit code from the customer');
      return;
    }
    setIsSubmitting(true);
    const problem = await onSubmit(code);
    setIsSubmitting(false);
    if (problem) setError(problem);
    else onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={isSubmitting ? undefined : onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <AppText variant="heading2">Hand over the order</AppText>
          <View style={styles.collect}>
            <AppText variant="caption" color="textSecondary">Collect cash</AppText>
            <AppText variant="heading1" color="primary">{formatPrice(amountToCollect)}</AppText>
          </View>
          <Input
            label="Customer’s delivery code"
            value={code}
            onChangeText={(text) => {
              setCode(digitsOnly(text, 4));
              if (error) setError(undefined);
            }}
            error={error}
            placeholder="0000"
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            autoFocus
            containerStyle={styles.input}
          />
          <Button label="Mark delivered" onPress={() => void submit()} loading={isSubmitting} disabled={code.length === 0} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.borderStrong, marginBottom: spacing.lg },
  collect: { marginTop: spacing.md, marginBottom: spacing.lg, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  input: { marginBottom: spacing.lg },
});
