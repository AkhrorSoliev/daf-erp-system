import { View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'coral' | 'teal';

const TONES: Record<BadgeTone, [string, string]> = {
  neutral: ['bg-ink-100', 'text-ink-600'],
  success: ['bg-success-50', 'text-success-600'],
  warning: ['bg-amber-50', 'text-amber-700'],
  danger: ['bg-danger-50', 'text-danger-600'],
  coral: ['bg-coral-50', 'text-coral-600'],
  teal: ['bg-teal-50', 'text-teal-700'],
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
