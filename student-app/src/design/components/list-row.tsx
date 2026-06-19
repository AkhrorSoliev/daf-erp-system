import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { tokens } from '@/design/tokens';
import { shadow } from '@/design/shadows';
import { IconTile, type Tone } from './icon-tile';
import { Text } from './text';

/** White clay list row: optional icon tile · label (+ subtitle) · trailing · chevron. */
export function ListRow({
  icon,
  tone = 'grape',
  label,
  subtitle,
  trailing,
  onPress,
  chevron,
  className,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  label: string;
  subtitle?: string | null;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  className?: string;
}) {
  const showChevron = chevron ?? !!onPress;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className={cn('flex-row items-center gap-3.5 rounded-card border border-line bg-white px-4 py-3.5', className)}
      style={({ pressed }) => [{ boxShadow: shadow.xs }, pressed && onPress && { transform: [{ scale: 0.985 }] }]}
    >
      {icon ? <IconTile icon={icon} tone={tone} /> : null}
      <View className="flex-1 gap-0.5">
        <Text variant="h3">{label}</Text>
        {subtitle ? <Text variant="muted">{subtitle}</Text> : null}
      </View>
      {trailing}
      {showChevron ? <Ionicons name="chevron-forward" size={20} color={tokens.color.fg} /> : null}
    </Pressable>
  );
}
