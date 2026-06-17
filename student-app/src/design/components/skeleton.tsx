import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/cn';

/** Loading placeholder. Animated shimmer is a v2 polish item. */
export function Skeleton({ className, ...props }: ViewProps) {
  return <View className={cn('rounded-button bg-surface', className)} {...props} />;
}

/** A few card-shaped skeletons for screen loading states. */
export function LoadingCards({ count = 4 }: { count?: number }) {
  return (
    <View className="gap-3 p-4">
      <Skeleton className="mb-1 h-7 w-40" />
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-card" />
      ))}
    </View>
  );
}
