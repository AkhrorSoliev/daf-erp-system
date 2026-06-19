import { View } from 'react-native';
import { EmptyState, Screen, ScreenHeader } from '@/design/components';

export default function Resurslar() {
  return (
    <Screen edges={['top']}>
      <View className="flex-1 p-5">
        <ScreenHeader title="Resurslar" />
        <View className="flex-1 items-center justify-center pb-24">
          <EmptyState icon="library-outline" title="Tez orada" description="Resurslar bo'limi tayyorlanmoqda." />
        </View>
      </View>
    </Screen>
  );
}
