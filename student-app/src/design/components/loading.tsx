import { ActivityIndicator, View } from 'react-native';
import { tokens } from '@/design/tokens';

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center p-8">
      <ActivityIndicator color={tokens.color.primary} />
    </View>
  );
}
