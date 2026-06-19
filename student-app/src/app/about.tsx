import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

import { Card, Screen, StackHeader, Text } from '@/design/components';
import { clay } from '@/design/shadows';

export default function About() {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <Screen edges={['top']}>
      <StackHeader title="Biz haqimizda" />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-4 p-5 pt-2">
          <View className="items-center gap-3 py-2">
            <View className="h-20 w-20 items-center justify-center rounded-3xl bg-coral-500" style={{ boxShadow: clay.coral }}>
              <Ionicons name="flash" size={40} color="#FFFFFF" />
            </View>
            <Text variant="heading">DAF Sprachzentrum</Text>
            <Text variant="muted" className="text-center">Nemis tili o&apos;quv markazi</Text>
          </View>

          <Card className="gap-2">
            <Text variant="h3">Markaz haqida</Text>
            <Text variant="body">
              DAF Sprachzentrum — nemis tilini zamonaviy uslublarda o&apos;rgatuvchi markaz. Ushbu ilova orqali
              jadvalingizni, davomatingizni va to&apos;lovlaringizni bir joyda kuzatib borasiz.
            </Text>
          </Card>

          <Card className="gap-3">
            <Text variant="h3">Aloqa</Text>
            <View className="flex-row items-center gap-3">
              <Ionicons name="call-outline" size={20} color="#0E9A90" />
              <Text variant="body">+998 90 000 00 00</Text>
            </View>
            <View className="flex-row items-center gap-3">
              <Ionicons name="globe-outline" size={20} color="#1B7BE0" />
              <Text variant="body">dafzentrum.uz</Text>
            </View>
            <View className="flex-row items-center gap-3">
              <Ionicons name="paper-plane-outline" size={20} color="#2E97FF" />
              <Text variant="body">@dafzentrum</Text>
            </View>
          </Card>

          <Text variant="muted" className="text-center">Ilova versiyasi {version}</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
