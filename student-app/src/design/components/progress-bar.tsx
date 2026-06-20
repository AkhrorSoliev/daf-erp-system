import { View } from 'react-native';
import { MotiView } from 'moti';
import { cn } from '@/lib/cn';
import { inset } from '@/design/shadows';
import { EASE } from './motion';

export type ProgressSegment = { value: number; color: string };

/** Sunken inset track with colored fills that grow in from the left on mount. */
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
    <View className={cn('overflow-hidden rounded-pill bg-sunk', className)} style={{ height, boxShadow: inset.soft }}>
      <MotiView
        from={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ type: 'timing', duration: 650, easing: EASE }}
        style={{ width: '100%', height: '100%', flexDirection: 'row', transformOrigin: '0% 50%' }}
      >
        {segments
          .filter((s) => s.value > 0)
          .map((s, i) => (
            <View key={i} style={{ flex: s.value, backgroundColor: s.color }} />
          ))}
      </MotiView>
    </View>
  );
}
