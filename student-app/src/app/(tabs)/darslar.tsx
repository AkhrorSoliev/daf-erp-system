import { View } from 'react-native';
import { EmptyState, Screen, ScreenHeader } from '@/design/components';

export default function Darslar() {
  return (
    <Screen edges={['top']}>
      <View className="flex-1 p-5">
        <ScreenHeader title="Darslar" />
        <View className="flex-1 items-center justify-center pb-24">
          <EmptyState icon="school-outline" title="Tez orada" description="Darslar bo'limi tayyorlanmoqda." />
        </View>
      </View>
    </Screen>
  );
}
