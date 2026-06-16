import { View } from 'react-native';
import { Text } from './text';

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View className="items-center justify-center gap-2 px-8 py-16">
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
