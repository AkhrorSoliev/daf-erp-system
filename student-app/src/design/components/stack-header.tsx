import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/design/colors';
import { Text } from './text';

/** Pushed-screen header: back chevron + title (+ optional right slot). */
export function StackHeader({ title, right }: { title: string; right?: ReactNode }) {
  const colors = useColors();
  return (
    <View className="flex-row items-center gap-1 px-4 pb-2 pt-1">
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        className="h-10 w-10 items-center justify-center rounded-full active:bg-tint"
      >
        <Ionicons name="chevron-back" size={26} color={colors.fg} />
      </Pressable>
      <Text variant="heading" numberOfLines={1} className="flex-1">
        {title}
      </Text>
      {right}
    </View>
  );
}
