import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdminScreenHeader, AppText, EmptyState, PressableScale } from '../../components';
import * as adminService from '../../services/adminService';
import { User } from '../../types';
import { colors, layout, radius, spacing } from '../../theme';

export function AdminCustomersScreen() {
  const [customers, setCustomers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setCustomers(await adminService.listCustomers()); setError(null); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load customers.'); } }, []);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (user: User) => { try { await adminService.setCustomerStatus(user.id, user.status === 'blocked' ? 'active' : 'blocked'); await load(); } catch (e) { Alert.alert('Could not update customer', e instanceof Error ? e.message : 'Try again.'); } };
  return <SafeAreaView style={styles.safe} edges={['top']}><View style={styles.header}><AdminScreenHeader title="Customers" subtitle="Account status is enforced by the backend." /></View>{error ? <AppText color="error" style={styles.error}>{error}</AppText> : null}<FlatList data={customers} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} ListEmptyComponent={<EmptyState title="No customers" message="Customer accounts will appear here." />} renderItem={({ item }) => <View style={styles.row}><View style={styles.copy}><AppText variant="bodyStrong">{item.name || 'Unnamed customer'}</AppText><AppText variant="caption" color="textSecondary">{item.phone} · {item.status}</AppText></View><PressableScale onPress={() => void toggle(item)} scaleTo={0.95} haptic="none"><AppText variant="captionStrong" color={item.status === 'blocked' ? 'success' : 'error'}>{item.status === 'blocked' ? 'Activate' : 'Block'}</AppText></PressableScale></View>} /></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, header: { paddingHorizontal: layout.gutter, paddingTop: spacing.lg }, list: { padding: layout.gutter, gap: spacing.sm }, row: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, copy: { flex: 1 }, error: { padding: layout.gutter } });
