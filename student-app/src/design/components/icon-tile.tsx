import { View, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { useColors } from '@/design/colors';

export type Tone = 'grape' | 'coral' | 'amber' | 'teal' | 'sky' | 'ink';

// [bg classes (light + dark), icon color] — soft tint in light, translucent in dark.
const TONES: Record<Tone, [string, string]> = {
  grape: ['bg-grape-100 dark:bg-grape-500/20', '#8B5CF6'],
  coral: ['bg-coral-50 dark:bg-coral-500/20', '#F04E2C'],
  amber: ['bg-amber-50 dark:bg-amber-500/20', '#F59512'],
  teal: ['bg-teal-50 dark:bg-teal-500/20', '#0E9A90'],
  sky: ['bg-sky-100 dark:bg-sky-500/20', '#2E97FF'],
  ink: ['bg-ink-100 dark:bg-white/10', ''], // icon color resolved from theme
};

export function IconTile({
  icon,
  tone = 'grape',
  size = 40,
  className,
  ...props
}: ViewProps & { icon: keyof typeof Ionicons.glyphMap; tone?: Tone; size?: number }) {
  const colors = useColors();
  const [bg, iconColor] = TONES[tone];
  const fg = tone === 'ink' ? colors.fgBody : iconColor;
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
