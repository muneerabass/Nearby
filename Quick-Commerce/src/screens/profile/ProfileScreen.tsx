import React, { useCallback } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AppText, PressableScale } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { colors, fontFamilies, layout, radius, spacing } from '../../theme';
import type { MainStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<MainStackParamList>;

interface RowItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  caption?: string;
  action: () => void;
}

function initialsFor(name?: string | null): string {
  if (!name) return 'ZU';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'ZU';
}

function SettingsRow({ item }: { item: RowItem }) {
  return (
    <PressableScale
      onPress={item.action}
      scaleTo={0.985}
      haptic="none"
      accessibilityRole="button"
      accessibilityLabel={item.label}
      style={styles.row}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={item.icon} size={18} color={colors.textSecondary} />
      </View>
      <View style={styles.rowCopy}>
        <AppText variant="bodySmall" style={styles.rowLabel}>
          {item.label}
        </AppText>
        {item.caption ? (
          <AppText variant="caption" color="textTertiary">
            {item.caption}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </PressableScale>
  );
}

export function ProfileScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { totals } = useCart();

  const handleShareReferral = useCallback(async () => {
    if (!user?.referral_code) return;
    try {
      await Share.share({
        message: `Use my referral code ${user.referral_code} to sign up on Zipp! 🛒`,
      });
    } catch {
      // user cancelled or share failed — no-op
    }
  }, [user?.referral_code]);

  const handleLogout = useCallback(() => {
    Alert.alert('Log out of Zipp?', 'You can sign back in with the same number any time.', [
      { text: 'Stay logged in', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void logout() },
    ]);
  }, [logout]);

  const sections: { title: string; items: RowItem[] }[] = [
    {
      title: 'Shopping',
      items: [
        { icon: 'receipt-outline', label: 'My orders', caption: 'Track and reorder', action: () => navigation.navigate('OrderList') },
        { icon: 'location-outline', label: 'My addresses', caption: 'Saved delivery locations', action: () => navigation.navigate('AddressList', undefined) },
      ],
    },
    {
      title: 'Support',
      items: [
        {
          icon: 'help-circle-outline',
          label: 'Help & support',
          action: () => Alert.alert('Help & support', 'Contact support@example.com for help.'),
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style="dark" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.huge }]}
      >
        <AppText variant="heading1" style={styles.pageTitle}>
          Account
        </AppText>

        <Animated.View entering={FadeInDown.duration(300)} style={styles.identityCard}>
          <View style={styles.avatar}>
            <AppText variant="heading2" color="textInverse">
              {initialsFor(user?.name)}
            </AppText>
          </View>

          <View style={styles.identityCopy}>
            <AppText variant="heading3" numberOfLines={1}>
              {user?.name ?? 'Zipp shopper'}
            </AppText>
            <AppText variant="bodySmall" color="textSecondary" numberOfLines={1}>
              {user?.phone ?? '—'}
            </AppText>
          </View>
        </Animated.View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <AppText variant="heading3">{totals.itemCount}</AppText>
            <AppText variant="caption" color="textTertiary">
              In cart
            </AppText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <AppText variant="heading3" numberOfLines={1}>
              {user?.role ?? 'customer'}
            </AppText>
            <AppText variant="caption" color="textTertiary">
              Role
            </AppText>
          </View>
        </View>

        {user ? (
          <Animated.View
            entering={FadeInDown.duration(280).delay(50)}
            style={styles.referralCard}
          >
            <View style={styles.referralHeader}>
              <Ionicons name="gift-outline" size={14} color={colors.primary} />
              <AppText variant="overline" color="primary" style={styles.referralTitle}>
                Referral
              </AppText>
            </View>

            <View style={styles.referralCodeRow}>
              <View style={styles.referralCodeBox}>
                <AppText variant="bodyStrong" style={styles.referralCodeText}>
                  {user.referral_code || '—'}
                </AppText>
              </View>
              <PressableScale
                onPress={handleShareReferral}
                scaleTo={0.94}
                haptic="light"
                disabled={!user.referral_code}
                accessibilityRole="button"
                accessibilityLabel="Share referral code"
                style={[styles.shareButton, !user.referral_code && styles.shareButtonDisabled]}
              >
                <Ionicons name="share-outline" size={15} color={colors.primary} />
                <AppText variant="buttonSmall" color="primary" style={styles.shareLabel}>
                  Share
                </AppText>
              </PressableScale>
            </View>

            {user.referred_by_code ? (
              <AppText variant="caption" color="textSecondary" style={styles.referredBy}>
                Invited with code {user.referred_by_code}
              </AppText>
            ) : (
              <AppText variant="caption" color="textTertiary" style={styles.referredBy}>
                Invite friends — share your code above
              </AppText>
            )}
          </Animated.View>
        ) : null}

        {sections.map((section, idx) => (
          <Animated.View
            key={section.title}
            entering={FadeInDown.duration(280).delay(60 + idx * 50)}
            style={styles.section}
          >
            <AppText variant="overline" color="textTertiary" style={styles.sectionTitle}>
              {section.title}
            </AppText>
            <View style={styles.card}>
              {section.items.map((item, index) => (
                <View key={item.label}>
                  <SettingsRow item={item} />
                  {index < section.items.length - 1 ? <View style={styles.rowDivider} /> : null}
                </View>
              ))}
            </View>
          </Animated.View>
        ))}

        <PressableScale
          onPress={handleLogout}
          scaleTo={0.98}
          accessibilityRole="button"
          accessibilityLabel="Log out"
          style={styles.logoutButton}
        >
          <Ionicons name="log-out-outline" size={19} color={colors.error} />
          <AppText variant="button" color="error" style={styles.logoutLabel}>
            Log out
          </AppText>
        </PressableScale>

        <AppText variant="caption" color="textTertiary" center style={styles.version}>
          Zipp · Version 1.0.0
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing.lg },
  pageTitle: { marginBottom: spacing.xl },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCopy: { flex: 1, marginLeft: spacing.lg },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginVertical: spacing.lg,
    backgroundColor: colors.canvas,
    borderRadius: radius.md,
  },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },
  section: { marginTop: spacing.xl },
  sectionTitle: { marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, marginHorizontal: spacing.md },
  rowLabel: { fontFamily: fontFamilies.semiBold },
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.xxxl },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.md,
    backgroundColor: colors.errorSoft,
  },
  logoutLabel: { marginLeft: spacing.sm },
  version: { marginTop: spacing.xl },
  referralCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  referralHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  referralTitle: {
    marginLeft: spacing.xs,
  },
  referralCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  referralCodeBox: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.canvas,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  referralCodeText: {
    letterSpacing: 2,
    color: colors.text,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  shareLabel: {
    marginLeft: spacing.xs,
  },
  shareButtonDisabled: {
    opacity: 0.4,
  },
  referredBy: {
    marginTop: spacing.sm,
  },
});
