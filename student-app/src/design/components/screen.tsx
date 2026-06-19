import { View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { cn } from '@/lib/cn';

/** Safe-area screen container with app background. */
export function Screen({
  className,
  edges = ['top', 'bottom'],
  ...props
}: ViewProps & { edges?: Edge[] }) {
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-bg">
      <View className={cn('flex-1', className)} {...props} />
    </SafeAreaView>
  );
}
