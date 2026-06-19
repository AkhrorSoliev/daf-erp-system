import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { tokens } from '@/design/tokens';
import { Text } from './text';

type Meta = { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap; label: string };

const META: Record<string, Meta> = {
  index: { active: 'home', inactive: 'home-outline', label: 'Asosiy' },
  schedule: { active: 'calendar', inactive: 'calendar-outline', label: 'Jadval' },
  attendance: { active: 'checkmark-done', inactive: 'checkmark-done-outline', label: 'Davomat' },
  payments: { active: 'wallet', inactive: 'wallet-outline', label: "To'lov" },
  profile: { active: 'person', inactive: 'person-outline', label: 'Profil' },
};

/** Floating glass nav pill: active tab is a solid coral circle, others icon + label. */
export function LumioTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) }}
      pointerEvents="box-none"
    >
      <View
        className="h-[68px] flex-row items-center justify-between gap-1 rounded-[34px] border border-white bg-white/95 px-3"
        style={{ boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(14,42,61,0.16)' }] }}
      >
        {state.routes.map((route, i) => {
          const meta = META[route.name];
          if (!meta) return null;
          const focused = state.index === i;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          if (focused) {
            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={{ selected: true }}
                onPress={onPress}
                className="h-14 w-14 items-center justify-center rounded-full bg-coral-500"
                style={{ boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 18, color: 'rgba(255,107,74,0.4)' }] }}
              >
                <Ionicons name={meta.active} size={24} color="#FFFFFF" />
              </Pressable>
            );
          }

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              onPress={onPress}
              className="flex-1 items-center justify-center gap-0.5 py-2 active:opacity-70"
            >
              <Ionicons name={meta.inactive} size={22} color={tokens.color.fgFaint} />
              <Text className="font-bodymd text-[11px] text-ink-400">{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
