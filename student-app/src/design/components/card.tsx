import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/cn';
import { shadow } from '@/design/shadows';

/** White clay card — rounded 22, hairline border, soft ink-tinted ambient shadow. */
export function Card({ className, style, ...props }: ViewProps) {
  return (
    <View
      className={cn('rounded-card border border-line bg-white p-5', className)}
      style={[{ boxShadow: shadow.card }, style]}
      {...props}
    />
  );
}
