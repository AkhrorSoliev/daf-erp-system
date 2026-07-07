import { Appearance, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Badge, ListRow, Screen, StackHeader, Text } from '@/design/components';
import { useColors, themeColors } from '@/design/colors';
import { shadow } from '@/design/shadows';
import { useThemeStore, type ThemeMode } from '@/design/theme';
import { useThemeTransition } from '@/design/theme-transition';
import { useT, useLang, useSetLang, LANGUAGES } from '@/i18n';
import { cn } from '@/lib/cn';

/** Background color the target mode resolves to — drives the reveal circle. */
function revealBg(m: ThemeMode): string {
  const scheme = m === 'system' ? Appearance.getColorScheme() ?? 'light' : m;
  return scheme === 'dark' ? themeColors.dark.bg : themeColors.light.bg;
}

const THEME_OPTS: { mode: ThemeMode; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: 'system', icon: 'phone-portrait-outline' },
  { mode: 'light', icon: 'sunny-outline' },
  { mode: 'dark', icon: 'moon-outline' },
];

export default function Settings() {
  const t = useT();
  const colors = useColors();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const { animateThemeChange } = useThemeTransition();
  const lang = useLang();
  const setLang = useSetLang();

  const themeLabel: Record<ThemeMode, string> = {
    system: t.settings.themeSystem,
    light: t.settings.themeLight,
    dark: t.settings.themeDark,
  };

  return (
    <Screen>
      <StackHeader title={t.tabs.settings} />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-6 p-5 pt-2">
          {/* Language */}
          <View className="gap-2.5">
            <Text variant="caps" className="px-1">{t.settings.language}</Text>
            <View className="flex-row gap-2 rounded-[20px] bg-sunk p-1.5">
              {LANGUAGES.map((l) => {
                const active = lang === l.code;
                return (
                  <Pressable
                    key={l.code}
                    onPress={() => setLang(l.code)}
                    className={cn('flex-1 flex-row items-center justify-center gap-1.5 rounded-[14px] py-3', active && 'bg-surface')}
                    style={active ? { boxShadow: shadow.sm } : undefined}
                  >
                    <Text className="text-[16px]">{l.flag}</Text>
                    <Text className={cn('font-bodymd text-[14px]', active ? 'text-fg' : 'text-fg-muted')}>{l.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Theme */}
          <View className="gap-2.5">
            <Text variant="caps" className="px-1">{t.settings.theme}</Text>
            <View className="flex-row gap-2 rounded-[20px] bg-sunk p-1.5">
              {THEME_OPTS.map((o) => {
                const active = mode === o.mode;
                return (
                  <Pressable
                    key={o.mode}
                    onPress={(e) => {
                      if (o.mode === mode) return;
                      const { pageX, pageY } = e.nativeEvent;
                      animateThemeChange(pageX, pageY, () => setMode(o.mode), revealBg(o.mode));
                    }}
                    className={cn('flex-1 items-center gap-1 rounded-[14px] py-3', active && 'bg-surface')}
                    style={active ? { boxShadow: shadow.sm } : undefined}
                  >
                    <Ionicons name={o.icon} size={20} color={active ? colors.fg : colors.fgMuted} />
                    <Text className={cn('font-bodymd text-[12px]', active ? 'text-fg' : 'text-fg-muted')}>{themeLabel[o.mode]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Coming soon */}
          <View className="gap-2.5">
            <Text variant="caps" className="px-1">{t.settings.other}</Text>
            <ListRow
              icon="chatbubbles"
              tone="grape"
              label={t.settings.translator}
              className="opacity-60"
              chevron={false}
              trailing={<Badge label={t.common.comingSoon} tone="neutral" />}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
