import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/design/colors';
import { Text } from './text';

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** The way out, e.g. a retry button. An error state must never be a dead end. */
  action?: ReactNode;
}) {
  const colors = useColors();
  return (
    <View className="items-center justify-center gap-3 px-8 py-14">
      {icon ? (
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-sunk">
          <Ionicons name={icon} size={30} color={colors.fgFaint} />
        </View>
      ) : null}
      <Text variant="title" className="text-center">
        {title}
      </Text>
      {description ? (
        <Text variant="muted" className="text-center">
          {description}
        </Text>
      ) : null}
      {action ? <View className="pt-1">{action}</View> : null}
    </View>
  );
}
