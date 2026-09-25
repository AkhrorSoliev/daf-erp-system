import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';

import { Card, Screen, StackHeader, Text } from '@/design/components';
import { clay } from '@/design/shadows';
import { tokens } from '@/design/tokens';
import { useT } from '@/i18n';

// The same contacts as the web portal's About page (client/src/lib/company.ts),
// so change them in both. A number, a domain and a handle read the same in every
// language, so they stay out of the dictionaries; only the spoken labels
// (t.about.contactA11y) are translated.
const CONTACTS: { key: 'phone' | 'website' | 'telegram'; icon: keyof typeof Ionicons.glyphMap; color: string; value: string; href: string }[] = [
  { key: 'phone', icon: 'call-outline', color: tokens.color.tealStrong, value: '+998 90 535 10 99', href: 'tel:+998905351099' },
  { key: 'website', icon: 'globe-outline', color: tokens.color.skyStrong, value: 'dafzentrum.uz', href: 'https://dafzentrum.uz' },
  { key: 'telegram', icon: 'paper-plane-outline', color: tokens.color.sky, value: '@dafferganaadmin', href: 'https://t.me/dafferganaadmin' },
];

export default function About() {
  const t = useT();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  // openURL rejects when nothing on the device handles the link (tel: on a tablet).
  const openLink = (href: string) =>
    Linking.openURL(href).catch(() => Alert.alert(t.common.errorTitle, t.about.openFailed));
  return (
    <Screen>
      <StackHeader title={t.tabs.about} />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-4 p-5 pt-2">
          <View className="items-center gap-3 py-2">
            <View className="h-20 w-20 items-center justify-center rounded-3xl bg-coral-500" style={{ boxShadow: clay.coral }}>
              <Ionicons name="flash" size={40} color="#FFFFFF" />
            </View>
            <Text variant="heading">{t.about.centerName}</Text>
            <Text variant="muted" className="text-center">{t.about.tagline}</Text>
          </View>

          <Card className="gap-2">
            <Text variant="h3">{t.about.aboutTitle}</Text>
            <Text variant="body">{t.about.aboutBody}</Text>
          </Card>

          <Card className="gap-3">
            <Text variant="h3">{t.about.contact}</Text>
            {CONTACTS.map((c) => (
              <Pressable
                key={c.key}
                onPress={() => openLink(c.href)}
                accessibilityRole="link"
                accessibilityLabel={t.about.contactA11y[c.key](c.value)}
                hitSlop={6}
                className="flex-row items-center gap-3 active:opacity-70"
              >
                <Ionicons name={c.icon} size={20} color={c.color} />
                <Text variant="body">{c.value}</Text>
              </Pressable>
            ))}
          </Card>

          <Text variant="muted" className="text-center">{t.about.version(version)}</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
