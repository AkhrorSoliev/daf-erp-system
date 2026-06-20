import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Badge, ListRow, Screen, StackHeader, Text } from '@/design/components';
import { useColors } from '@/design/colors';
import { shadow } from '@/design/shadows';
import { useThemeStore, type ThemeMode } from '@/design/theme';
import { cn } from '@/lib/cn';

const THEME_OPTS: { mode: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: 'system', label: 'Tizim', icon: 'phone-portrait-outline' },
  { mode: 'light', label: "Yorug'", icon: 'sunny-outline' },
  { mode: 'dark', label: "Qorong'i", icon: 'moon-outline' },
];

export default function Settings() {
  const colors = useColors();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <Screen>
      <StackHeader title="Sozlamalar" />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-6 p-5 pt-2">
          {/* Theme */}
          <View className="gap-2.5">
            <Text variant="caps" className="px-1">Mavzu</Text>
            <View className="flex-row gap-2 rounded-[20px] bg-sunk p-1.5">
              {THEME_OPTS.map((o) => {
                const active = mode === o.mode;
                return (
                  <Pressable
                    key={o.mode}
                    onPress={() => setMode(o.mode)}
                    className={cn('flex-1 items-center gap-1 rounded-[14px] py-3', active && 'bg-surface')}
                    style={active ? { boxShadow: shadow.sm } : undefined}
                  >
                    <Ionicons name={o.icon} size={20} color={active ? colors.fg : colors.fgMuted} />
                    <Text className={cn('font-bodymd text-[12px]', active ? 'text-fg' : 'text-fg-muted')}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Coming soon */}
          <View className="gap-2.5">
            <Text variant="caps" className="px-1">Boshqa</Text>
            <ListRow
              icon="language"
              tone="sky"
              label="Til"
              className="opacity-60"
              chevron={false}
              trailing={<Badge label="Tez orada" tone="neutral" />}
            />
            <ListRow
              icon="chatbubbles"
              tone="grape"
              label="Tarjimon"
              className="opacity-60"
              chevron={false}
              trailing={<Badge label="Tez orada" tone="neutral" />}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
