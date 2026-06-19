import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

/** Top-left screen title (chunky Baloo) with an optional right slot. */
export function ScreenHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('flex-row items-end justify-between', className)}>
      <View className="flex-1 gap-0.5">
        {subtitle ? <Text variant="muted">{subtitle}</Text> : null}
        <Text variant="heading">{title}</Text>
      </View>
      {right}
    </View>
  );
}
