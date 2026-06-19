import { View } from 'react-native';
import { cn } from '@/lib/cn';
import { inset } from '@/design/shadows';

export type ProgressSegment = { value: number; color: string };

/** Sunken inset track with one or more colored fills (single % or segmented). */
export function ProgressBar({
  segments,
  height = 12,
  className,
}: {
  segments: ProgressSegment[];
  height?: number;
  className?: string;
}) {
  return (
    <View
      className={cn('flex-row overflow-hidden rounded-pill bg-sunk', className)}
      style={{ height, boxShadow: inset.soft }}
    >
      {segments
        .filter((s) => s.value > 0)
        .map((s, i) => (
          <View key={i} style={{ flex: s.value, backgroundColor: s.color }} />
        ))}
    </View>
  );
}
