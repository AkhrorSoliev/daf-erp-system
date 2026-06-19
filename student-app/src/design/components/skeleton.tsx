import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/cn';

/** Sunken loading placeholder. Animated shimmer is a v2 polish item. */
export function Skeleton({ className, ...props }: ViewProps) {
  return <View className={cn('rounded-md bg-sunk', className)} {...props} />;
}

/** A few card-shaped skeletons for screen loading states. */
export function LoadingCards({ count = 4 }: { count?: number }) {
  return (
    <View className="gap-3 p-5">
      <Skeleton className="mb-1 h-8 w-40 rounded-lg" />
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-card" />
      ))}
    </View>
  );
}
