import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/cn';

/** Loading placeholder. Animated shimmer is a v2 polish item. */
export function Skeleton({ className, ...props }: ViewProps) {
  return <View className={cn('rounded-button bg-surface', className)} {...props} />;
}
