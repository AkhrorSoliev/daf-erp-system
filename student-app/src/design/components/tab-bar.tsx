import { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import { MotiView } from 'moti';
import { Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useColors } from '@/design/colors';
import { useT } from '@/i18n';
import { Text } from './text';

const CIRCLE = 56;
const PILL_H = 68;
const EASE = Easing.bezier(0.22, 1, 0.36, 1); // Lumio --ease-out

type Meta = { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap };

const META: Record<string, Meta> = {
  index: { active: 'home', inactive: 'home-outline' },
  darslar: { active: 'school', inactive: 'school-outline' },
  resurslar: { active: 'library', inactive: 'library-outline' },
  more: { active: 'grid', inactive: 'grid-outline' },
};

/** Floating glass nav pill: a coral circle slides between tabs; labels fade in/out. */
export function LumioTabBar({ state, navigation }: BottomTabBarProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [rowW, setRowW] = useState(0);

  const n = state.routes.length;
  const cellW = rowW > 0 ? rowW / n : 0;
  const indicatorX = cellW > 0 ? state.index * cellW + (cellW - CIRCLE) / 2 : 0;

  return (
    <View
      style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 16 }}
      pointerEvents="box-none"
    >
      <View
        className="h-[68px] flex-row items-center rounded-[34px] border border-border bg-surface/95 px-2"
        style={{ boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(14,42,61,0.16)' }] }}
      >
        <View
          className="flex-1 flex-row"
          style={{ height: '100%' }}
          onLayout={(e: LayoutChangeEvent) => setRowW(e.nativeEvent.layout.width)}
        >
          {/* Sliding coral circle (behind the icons) */}
          {cellW > 0 ? (
            <MotiView
              animate={{ translateX: indicatorX }}
              transition={{ type: 'timing', duration: 240, easing: EASE }}
              style={{
                position: 'absolute',
                top: (PILL_H - CIRCLE) / 2,
                left: 0,
                width: CIRCLE,
                height: CIRCLE,
                borderRadius: CIRCLE / 2,
                backgroundColor: '#FF6B4A',
                boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 18, color: 'rgba(255,107,74,0.4)' }],
              }}
            />
          ) : null}

          {state.routes.map((route, i) => {
            const meta = META[route.name];
            if (!meta) return null;
            const focused = state.index === i;
            const label = t.nav[route.name as keyof typeof t.nav] ?? route.name;

            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                onPress={onPress}
                className="flex-1 items-center justify-center active:opacity-80"
              >
                <Ionicons
                  name={focused ? meta.active : meta.inactive}
                  size={focused ? 24 : 22}
                  color={focused ? '#FFFFFF' : colors.fgFaint}
                />
                <MotiView
                  animate={{ opacity: focused ? 0 : 1, height: focused ? 0 : 14 }}
                  transition={{ type: 'timing', duration: 200, easing: EASE }}
                  style={{ overflow: 'hidden' }}
                >
                  <Text className="font-bodymd text-[11px] text-fg-faint" style={{ marginTop: 2 }}>
                    {label}
                  </Text>
                </MotiView>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
