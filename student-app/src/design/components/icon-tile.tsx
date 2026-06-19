import { View, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';

export type Tone = 'grape' | 'coral' | 'amber' | 'teal' | 'sky' | 'ink';

/** [bgClass, iconColor] per tone — the soft tile behind a list/section icon. */
export const TONES: Record<Tone, [string, string]> = {
  grape: ['bg-grape-100', '#7C3AED'],
  coral: ['bg-coral-50', '#F04E2C'],
  amber: ['bg-amber-50', '#F59512'],
  teal: ['bg-teal-50', '#0E9A90'],
  sky: ['bg-sky-100', '#1B7BE0'],
  ink: ['bg-ink-100', '#2B4A5C'],
};

export function IconTile({
  icon,
  tone = 'grape',
  size = 40,
  className,
  ...props
}: ViewProps & { icon: keyof typeof Ionicons.glyphMap; tone?: Tone; size?: number }) {
  const [bg, fg] = TONES[tone];
  return (
    <View
      className={cn('items-center justify-center rounded-sm', bg, className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <Ionicons name={icon} size={Math.round(size * 0.55)} color={fg} />
    </View>
  );
}
