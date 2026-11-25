import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Button } from './Button';
import { Input } from './Input';
import { PressableScale } from './PressableScale';
import { colors, radius, spacing } from '../theme';

interface ReasonSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  /** Quick-pick reasons; tapping one fills the field. */
  suggestions?: string[];
  /** Hint inside the empty field. */
  placeholder?: string;
  onClose: () => void;
  /** Resolves with an error message to show inline, or null on success (the sheet then closes). */
  onSubmit: (reason: string) => Promise<string | null>;
}

const MAX_REASON = 300;

/** A required free-text reason with quick picks. Replaces Alert.prompt, which only exists on iOS. */
export function ReasonSheet({ visible, title, message, confirmLabel, suggestions = [], placeholder = 'Tell the customer what happened', onClose, onSubmit }: ReasonSheetProps) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setReason('');
      setError(undefined);
    }
  }, [visible]);

  const submit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('A reason is required');
      return;
    }
    setIsSubmitting(true);
    const problem = await onSubmit(trimmed);
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
          <AppText variant="heading2">{title}</AppText>
          {message ? <AppText variant="bodySmall" color="textSecondary" style={styles.message}>{message}</AppText> : null}
          {suggestions.length > 0 ? (
            <View style={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <PressableScale
                  key={suggestion}
                  onPress={() => {
                    setReason(suggestion);
                    setError(undefined);
                  }}
                  scaleTo={0.96}
                  haptic="none"
                  style={[styles.suggestion, reason === suggestion && styles.suggestionActive]}
                >
                  <AppText variant="captionStrong" color={reason === suggestion ? 'primary' : 'textSecondary'}>{suggestion}</AppText>
                </PressableScale>
              ))}
            </View>
          ) : null}
          <Input
            label="Reason"
            value={reason}
            onChangeText={(text) => {
              setReason(text.slice(0, MAX_REASON));
              if (error) setError(undefined);
            }}
            error={error}
            placeholder={placeholder}
            multiline
            containerStyle={styles.input}
          />
          <Button label={confirmLabel} variant="danger" onPress={() => void submit()} loading={isSubmitting} disabled={reason.trim().length === 0} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.borderStrong, marginBottom: spacing.lg },
  message: { marginTop: spacing.xs },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  suggestion: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.canvas },
  suggestionActive: { backgroundColor: colors.primarySoft },
  input: { marginVertical: spacing.lg },
});
