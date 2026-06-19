import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useColors } from '@/design/colors';
import { Text } from './text';

type Meta = { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap; label: string };

const META: Record<string, Meta> = {
  index: { active: 'home', inactive: 'home-outline', label: 'Asosiy' },
  darslar: { active: 'school', inactive: 'school-outline', label: 'Darslar' },
  resurslar: { active: 'library', inactive: 'library-outline', label: 'Resurslar' },
  more: { active: 'grid', inactive: 'grid-outline', label: "Ko'proq" },
};

/** Floating glass nav pill: active tab is a solid coral circle, others icon + label. */
export function LumioTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  return (
    <View
      style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) }}
      pointerEvents="box-none"
    >
      <View
        className="h-[68px] flex-row items-center justify-between gap-1 rounded-[34px] border border-border bg-surface/95 px-3"
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
              <Ionicons name={meta.inactive} size={22} color={colors.fgFaint} />
              <Text className="font-bodymd text-[11px] text-fg-faint">{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
