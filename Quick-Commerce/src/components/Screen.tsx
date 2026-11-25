import React from 'react';
import { KeyboardAvoidingView, Platform, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

interface ScreenProps {
  children: React.ReactNode;
  /**
   * Which edges to inset. Tab screens only need `top` (the tab bar owns the bottom
   * inset); pushed stack screens sit over the home indicator, so they need `bottom` too.
   */
  edges?: Edge[];
  /** Wrap in a KeyboardAvoidingView — for screens with text inputs. */
  keyboard?: boolean;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
}

/** Standard screen container: safe-area aware, themed background, optional keyboard avoidance. */
export function Screen({
  children,
  edges = ['top', 'bottom'],
  keyboard = false,
  backgroundColor = colors.background,
  style,
}: ScreenProps) {
  const content = keyboard ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {children}
    </KeyboardAvoidingView>
  ) : (
    children
  );
  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor }, style]}>
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
