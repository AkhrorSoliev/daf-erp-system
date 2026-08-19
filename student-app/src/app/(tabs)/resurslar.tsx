import { View } from 'react-native';
import { EmptyState, Screen, ScreenHeader } from '@/design/components';
import { useT } from '@/i18n';

export default function Resurslar() {
  const t = useT();
  return (
    <Screen>
      <View className="flex-1 p-5">
        <ScreenHeader title={t.nav.resurslar} />
        <View className="flex-1 items-center justify-center pb-24">
          <EmptyState icon="library-outline" title={t.common.comingSoon} description="Resurslar bo'limi tayyorlanmoqda." />
        </View>
      </View>
    </Screen>
  );
}
