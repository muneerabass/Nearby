import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useDelivery } from '../../context/DeliveryContext';
import { colors, layout, radius, spacing } from '../../theme';

export function DeliveryProfileScreen() {
  const { user, logout } = useAuth();
  const { isOnline, lastSeenAt } = useDelivery();
  return <SafeAreaView style={styles.safe} edges={['top']}><View style={styles.content}><AppText variant="heading1">Profile</AppText><View style={styles.card}><AppText variant="heading3">{user?.name || 'Delivery partner'}</AppText><AppText variant="bodySmall" color="textSecondary">{user?.phone}</AppText><AppText variant="bodySmall" color={isOnline ? 'success' : 'textSecondary'} style={styles.status}>{isOnline ? 'Online' : 'Offline'}</AppText>{lastSeenAt ? <AppText variant="caption" color="textTertiary">Last seen {new Date(lastSeenAt).toLocaleString()}</AppText> : null}</View><Button label="Log out" variant="danger" onPress={() => Alert.alert('Log out?', 'You can sign in again later.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: () => void logout() }])} /></View></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { padding: layout.gutter }, card: { marginVertical: spacing.xl, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, status: { marginTop: spacing.md } });
