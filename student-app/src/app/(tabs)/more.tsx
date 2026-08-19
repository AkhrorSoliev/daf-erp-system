import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { Avatar, Card, FadeIn, ListRow, Screen, ScreenHeader, Text } from '@/design/components';
import { useColors } from '@/design/colors';
import { shadow } from '@/design/shadows';
import { useProfile } from '@/api/queries/use-profile';
import { useAuth } from '@/auth/auth-store';
import { useT } from '@/i18n';

export default function More() {
  const t = useT();
  const q = useProfile();
  const colors = useColors();
  const signOut = useAuth((s) => s.signOut);
  const queryClient = useQueryClient();

  const p = q.data;
  const name = p ? `${p.firstName} ${p.lastName}`.trim() : '';
  const initials = p ? `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() : '';

  function confirmLogout() {
    Alert.alert(t.more.logoutConfirmTitle, t.more.logoutConfirmMessage, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.more.logout,
        style: 'destructive',
        onPress: async () => {
          await signOut();
          queryClient.clear();
        },
      },
    ]);
  }

  const menu = [
    { icon: 'wallet' as const, tone: 'teal' as const, label: t.more.payments, onPress: () => router.push('/payments') },
    { icon: 'help-circle' as const, tone: 'sky' as const, label: t.more.faq, onPress: () => router.push('/faq') },
    { icon: 'information-circle' as const, tone: 'grape' as const, label: t.more.about, onPress: () => router.push('/about') },
    { icon: 'settings' as const, tone: 'ink' as const, label: t.more.settings, onPress: () => router.push('/settings') },
    { icon: 'log-out' as const, tone: 'coral' as const, label: t.more.logout, onPress: confirmLogout, chevron: false },
  ];

  return (
    <Screen>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-3 p-5 pb-32">
          <ScreenHeader title={t.tabs.more} />

          {/* Profile header → profile screen */}
          <FadeIn index={0}>
            <Pressable onPress={() => router.push('/profile')}>
              <Card className="flex-row items-center gap-3.5" style={{ boxShadow: shadow.card }}>
                <Avatar uri={p?.photo} initials={initials} size={56} />
                <View className="flex-1">
                  <Text variant="title">{name || t.more.profileFallback}</Text>
                  <Text variant="muted">{t.more.viewProfile}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.fgFaint} />
              </Card>
            </Pressable>
          </FadeIn>

          <View className="gap-2.5 pt-1">
            {menu.map((m, i) => (
              <FadeIn key={m.label} index={i + 1}>
                <ListRow icon={m.icon} tone={m.tone} label={m.label} onPress={m.onPress} chevron={m.chevron} />
              </FadeIn>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
