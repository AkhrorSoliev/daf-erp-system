import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '@/design/tokens';
import { Text } from './text';

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View className="items-center justify-center gap-3 px-8 py-14">
      {icon ? (
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-ink-100">
          <Ionicons name={icon} size={30} color={tokens.color.fgFaint} />
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
    </View>
  );
}
