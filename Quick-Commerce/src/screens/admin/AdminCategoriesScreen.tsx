import React, { useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AdminScreenHeader, AppText, Button, EmptyState, Input, PressableScale } from '../../components';
import * as adminService from '../../services/adminService';
import { useAdmin } from '../../context/AdminContext';
import { colors, layout, radius, spacing } from '../../theme';
import type { AdminStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<AdminStackParamList>;

/**
 * Read-only categories list. Backend has no POST /admin/categories yet; this screen
 * surfaces whatever /admin/categories returns so admins can see what IDs exist.
 */
export function AdminCategoriesScreen() {
  const navigation = useNavigation<Navigation>();
  const { categories, refresh } = useAdmin();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { await adminService.createCategory({ name: name.trim() }); setName(''); await refresh(); }
    catch (e) { Alert.alert('Could not create category', e instanceof Error ? e.message : 'Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <PressableScale onPress={() => navigation.goBack()} scaleTo={0.9} haptic="none" style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </PressableScale>
        <AdminScreenHeader title="Categories" subtitle="Manage the categories shown to customers." />
      </View>

      <View style={styles.form}>
        <Input label="Category name" value={name} onChangeText={setName} placeholder="e.g. Fresh produce" />
        <Button label="Add category" onPress={() => void add()} loading={busy} disabled={!name.trim()} />
      </View>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          <EmptyState emoji="📂" title="No categories" message="Seed categories via the backend to see them here." />
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.copy}><AppText variant="bodyStrong">{item.name}</AppText><AppText variant="caption" color={item.is_active ? 'success' : 'textTertiary'}>{item.is_active ? 'Active' : 'Inactive'} · order {item.display_order}</AppText></View>
            <PressableScale onPress={async () => { try { await adminService.updateCategory(item.id, { is_active: !item.is_active }); await refresh(); } catch (e) { Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.'); } }} scaleTo={0.95} haptic="none"><AppText variant="captionStrong" color="primary">{item.is_active ? 'Disable' : 'Enable'}</AppText></PressableScale>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', paddingHorizontal: layout.gutter, paddingTop: spacing.lg, gap: spacing.md },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { paddingHorizontal: layout.gutter, paddingTop: spacing.lg, paddingBottom: spacing.huge },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  form: { paddingHorizontal: layout.gutter, paddingTop: spacing.md, paddingBottom: spacing.md },
  copy: { flex: 1 },
});
