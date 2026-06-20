import { View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'coral' | 'teal';

// [bg classes, text classes] — soft tint in light, translucent accent in dark.
const TONES: Record<BadgeTone, [string, string]> = {
  neutral: ['bg-sunk', 'text-fg-muted'],
  success: ['bg-success-50 dark:bg-success-600/20', 'text-success-600 dark:text-success-400'],
  warning: ['bg-amber-50 dark:bg-amber-600/20', 'text-amber-700 dark:text-amber-300'],
  danger: ['bg-danger-50 dark:bg-danger-600/20', 'text-danger-600 dark:text-danger-400'],
  coral: ['bg-coral-50 dark:bg-coral-600/20', 'text-coral-600 dark:text-coral-400'],
  teal: ['bg-teal-50 dark:bg-teal-600/20', 'text-teal-700 dark:text-teal-300'],
};

/** Small rounded status pill. */
export function Badge({ label, tone = 'neutral', className }: { label: string; tone?: BadgeTone; className?: string }) {
  const [bg, txt] = TONES[tone];
  return (
    <View className={cn('self-start rounded-pill px-2.5 py-1', bg, className)}>
      <Text className={cn('font-bodyx text-[12px]', txt)}>{label}</Text>
    </View>
  );
}
