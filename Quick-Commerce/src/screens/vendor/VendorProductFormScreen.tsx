import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, Button, FilterChips, Input, PressableScale } from '../../components';
import * as vendorService from '../../services/vendorService';
import type { CategoryRow } from '../../services/adminService';
import { getErrorMessage } from '../../utils/errors';
import { paiseToRupees, rupeesToPaise } from '../../utils/price';
import { colors, layout, radius, spacing } from '../../theme';
import type { VendorStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<VendorStackParamList, 'VendorProductForm'>;
type Errors = Partial<Record<'name' | 'price' | 'mrp' | 'stock', string>>;

const NO_CATEGORY = '';

function parseRupees(text: string): number | null {
  const value = Number(text.replace(/,/g, '').trim());
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function VendorProductFormScreen({ navigation, route }: Props) {
  const editingId = route.params?.productId;
  const [loaded, setLoaded] = useState(!editingId);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [mrp, setMrp] = useState('');
  const [unit, setUnit] = useState('');
  const [description, setDescription] = useState('');
  const [stock, setStock] = useState('');
  const [categoryId, setCategoryId] = useState(NO_CATEGORY);
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats, products] = await Promise.all([vendorService.listCategories(), editingId ? vendorService.listProducts() : Promise.resolve([])]);
        if (cancelled) return;
        setCategories(cats.filter((c) => c.is_active));
        const existing = products.find((p) => p.id === editingId);
        if (existing) {
          setName(existing.name);
          setPrice(String(paiseToRupees(existing.price)));
          setMrp(existing.mrp ? String(paiseToRupees(existing.mrp)) : '');
          setUnit(existing.unit ?? '');
          setDescription(existing.description ?? '');
          setCategoryId(existing.category_id ?? NO_CATEGORY);
          setIsActive(existing.is_active !== false);
        }
      } catch (e) {
        if (!cancelled) Alert.alert('Could not load', getErrorMessage(e), [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId, navigation]);

  const submit = useCallback(async () => {
    const next: Errors = {};
    const priceValue = parseRupees(price);
    const mrpValue = mrp.trim() === '' ? 0 : parseRupees(mrp);
    if (!name.trim()) next.name = 'Product name is required';
    if (priceValue === null || priceValue <= 0) next.price = 'Enter a price above ₹0';
    if (mrpValue === null) next.mrp = 'Enter a valid MRP';
    else if (priceValue !== null && mrpValue > 0 && mrpValue < priceValue) next.mrp = 'MRP cannot be below the selling price';
    const stockValue = stock.trim() === '' ? 0 : Number(stock);
    if (!editingId && (!Number.isInteger(stockValue) || stockValue < 0)) next.stock = 'Enter a whole number';
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setIsSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        price: rupeesToPaise(priceValue as number),
        mrp: rupeesToPaise(mrpValue as number),
        unit: unit.trim() || null,
        description: description.trim() || null,
        category_id: categoryId || null,
      };
      if (editingId) await vendorService.updateProduct(editingId, { ...body, is_active: isActive });
      else await vendorService.createProduct({ ...body, quantity: stockValue });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save product', getErrorMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  }, [categoryId, description, editingId, isActive, mrp, name, navigation, price, stock, unit]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <PressableScale onPress={() => navigation.goBack()} scaleTo={0.9} haptic="none" accessibilityRole="button" accessibilityLabel="Go back" style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </PressableScale>
        <AppText variant="heading2" style={styles.title}>{editingId ? 'Edit product' : 'Add product'}</AppText>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loaded ? (
          <>
            <Input label="Name" value={name} onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: undefined })); }} error={errors.name} />
            <View style={styles.pair}>
              <Input label="Selling price (₹)" value={price} onChangeText={(v) => { setPrice(v); setErrors((e) => ({ ...e, price: undefined })); }} keyboardType="decimal-pad" error={errors.price} containerStyle={styles.half} />
              <Input label="MRP (₹)" optional value={mrp} onChangeText={(v) => { setMrp(v); setErrors((e) => ({ ...e, mrp: undefined })); }} keyboardType="decimal-pad" error={errors.mrp} containerStyle={styles.half} />
            </View>
            <Input label="Unit" optional value={unit} onChangeText={setUnit} placeholder="e.g. 1 kg, 500 ml" />
            <Input label="Description" optional value={description} onChangeText={setDescription} multiline />
            {!editingId ? (
              <Input label="Opening stock" value={stock} onChangeText={(v) => { setStock(v.replace(/[^0-9]/g, '')); setErrors((e) => ({ ...e, stock: undefined })); }} keyboardType="number-pad" error={errors.stock} hint="You can change stock any time from the catalog." />
            ) : null}

            {categories.length > 0 ? (
              <>
                <AppText variant="captionStrong" color="textSecondary" style={styles.label}>Category</AppText>
                <View style={styles.chips}>
                  <FilterChips value={categoryId} onChange={setCategoryId} options={[{ key: NO_CATEGORY, label: 'None' }, ...categories.map((c) => ({ key: c.id, label: c.name }))]} />
                </View>
              </>
            ) : null}

            {editingId ? (
              <PressableScale onPress={() => setIsActive((v) => !v)} scaleTo={0.98} haptic="none" style={[styles.toggle, isActive && styles.toggleActive]}>
                <Ionicons name={isActive ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={isActive ? colors.primary : colors.textSecondary} />
                <AppText variant="button" color={isActive ? 'primary' : 'textSecondary'} style={styles.toggleLabel}>Visible to customers</AppText>
              </PressableScale>
            ) : null}

            <Button label={editingId ? 'Save changes' : 'Add product'} onPress={() => void submit()} loading={isSubmitting} style={styles.submit} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.gutter, paddingVertical: spacing.lg },
  backButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  title: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xxxl },
  pair: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  label: { marginTop: spacing.sm, marginBottom: spacing.sm },
  chips: { marginHorizontal: -layout.gutter, marginBottom: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.canvas, marginTop: spacing.md },
  toggleActive: { backgroundColor: colors.primarySoft },
  toggleLabel: { marginLeft: spacing.sm },
  submit: { marginTop: spacing.xl },
});
