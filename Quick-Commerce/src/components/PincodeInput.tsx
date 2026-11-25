import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Button } from './Button';
import { Input } from './Input';
import { PressableScale } from './PressableScale';
import { colors, radius, spacing } from '../theme';
import { digitsOnly, validatePincode } from '../utils/validation';

interface PincodeInputProps {
  label?: string;
  hint?: string;
  value: string[];
  onChange: (pincodes: string[]) => void;
  /** Error from the parent (e.g. "add at least one pincode"). */
  error?: string;
}

/** Add/remove list of 6-digit pincodes shown as removable chips. */
export function PincodeInput({ label = 'Serviceable pincodes', hint, value, onChange, error }: PincodeInputProps) {
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | undefined>();

  const add = useCallback(() => {
    const problem = validatePincode(draft);
    if (problem) {
      setDraftError(problem);
      return;
    }
    const pincode = draft.trim();
    if (value.includes(pincode)) {
      setDraftError('That pincode is already added');
      return;
    }
    onChange([...value, pincode]);
    setDraft('');
    setDraftError(undefined);
  }, [draft, onChange, value]);

  const remove = useCallback((pincode: string) => onChange(value.filter((p) => p !== pincode)), [onChange, value]);

  return (
    <View style={styles.wrap}>
      <AppText variant="captionStrong" style={styles.label}>{label}</AppText>
      <View style={styles.inputRow}>
        <Input
          value={draft}
          onChangeText={(text) => {
            setDraft(digitsOnly(text, 6));
            if (draftError) setDraftError(undefined);
          }}
          onSubmitEditing={add}
          placeholder="e.g. 560001"
          keyboardType="number-pad"
          maxLength={6}
          returnKeyType="done"
          error={draftError}
          containerStyle={styles.input}
        />
        <Button label="Add" onPress={add} size="md" fullWidth={false} variant="secondary" style={styles.addButton} />
      </View>

      {value.length > 0 ? (
        <View style={styles.chips}>
          {value.map((pincode) => (
            <View key={pincode} style={styles.chip}>
              <AppText variant="captionStrong" color="primary">{pincode}</AppText>
              <PressableScale
                onPress={() => remove(pincode)}
                scaleTo={0.85}
                haptic="none"
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove pincode ${pincode}`}
                style={styles.chipRemove}
              >
                <Ionicons name="close" size={14} color={colors.primary} />
              </PressableScale>
            </View>
          ))}
        </View>
      ) : (
        <AppText variant="caption" color={error ? 'error' : 'textTertiary'} style={styles.hint}>
          {error ?? hint ?? 'No pincodes yet — customers can’t see this store until you add one.'}
        </AppText>
      )}
      {value.length > 0 && error ? (
        <AppText variant="caption" color="error" style={styles.hint}>{error}</AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.xs },
  inputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  input: { flex: 1 },
  addButton: { paddingHorizontal: spacing.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  chipRemove: { marginLeft: spacing.xs, padding: spacing.xs },
  hint: { marginTop: spacing.sm },
});
