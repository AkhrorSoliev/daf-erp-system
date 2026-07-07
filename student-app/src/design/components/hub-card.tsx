import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { MotiView } from 'moti';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { clay } from '@/design/shadows';
import { EASE, DUR } from './motion';
import { Text } from './text';

export type HubTone = 'grape' | 'sky' | 'teal' | 'amber' | 'coral';

const TONE: Record<HubTone, { bg: string; clay: any }> = {
  grape: { bg: 'bg-grape-500', clay: clay.grape },
  sky: { bg: 'bg-sky-500', clay: clay.sky },
  teal: { bg: 'bg-teal-500', clay: clay.teal },
  amber: { bg: 'bg-amber-500', clay: clay.amber },
  coral: { bg: 'bg-coral-500', clay: clay.coral },
};

/**
 * Big gamified feature card — chunky accent clay block with an icon badge, a
 * corner "open" arrow, a heading, and an optional stats/content slot below.
 * Used on the home hub (Jang, Mening lug'atim, Zoom tadbirlari, Peshqadamlar).
 */
export function HubCard({
  title,
  subtitle,
  icon,
  tone = 'grape',
  onPress,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: HubTone;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  const t = TONE[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <MotiView
        animate={{ scale: pressed && onPress ? 0.97 : 1 }}
        transition={{ type: 'timing', duration: DUR.fast, easing: EASE }}
      >
        <View className={cn('overflow-hidden rounded-xl p-5', t.bg)} style={{ boxShadow: t.clay }}>
          <View className="flex-row items-start justify-between">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <Ionicons name={icon} size={26} color="#FFFFFF" />
            </View>
            {onPress ? (
              <View className="h-9 w-9 items-center justify-center rounded-pill bg-white">
                <Ionicons name="arrow-up" size={18} color="#0E2A3D" style={{ transform: [{ rotate: '45deg' }] }} />
              </View>
            ) : null}
          </View>

          <Text variant="heading" className="mt-3.5 text-white">
            {title}
          </Text>
          {subtitle ? <Text className="mt-1 font-body text-[14px] leading-[20px] text-white/85">{subtitle}</Text> : null}
          {children ? <View className="mt-3.5">{children}</View> : null}
        </View>
      </MotiView>
    </Pressable>
  );
}
