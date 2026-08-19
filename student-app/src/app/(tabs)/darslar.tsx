import { View } from 'react-native';
import { EmptyState, Screen, ScreenHeader } from '@/design/components';
import { useT } from '@/i18n';

export default function Darslar() {
  const t = useT();
  return (
    <Screen>
      <View className="flex-1 p-5">
        <ScreenHeader title={t.nav.darslar} />
        <View className="flex-1 items-center justify-center pb-24">
          <EmptyState icon="school-outline" title={t.common.comingSoon} description="Darslar bo'limi tayyorlanmoqda." />
        </View>
      </View>
    </Screen>
  );
}
