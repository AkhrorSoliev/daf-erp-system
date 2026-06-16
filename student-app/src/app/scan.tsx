import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useQueryClient } from '@tanstack/react-query';

import { Button, Loading, Screen, Text } from '@/design/components';
import { scanQr } from '@/api/attendance';
import { getErrorMessage } from '@/lib/get-error-message';

export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const queryClient = useQueryClient();

  if (!permission) return <Screen><Loading /></Screen>;

  if (!permission.granted) {
    return (
      <Screen className="justify-center px-6">
        <View className="gap-4">
          <Text variant="title">Kamera ruxsati kerak</Text>
          <Text variant="muted">QR kodni skanerlash uchun kameraga ruxsat bering.</Text>
          <Button label="Ruxsat berish" onPress={requestPermission} />
          <Button label="Orqaga" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  async function onScanned({ data }: { data: string }) {
    if (lock.current || busy) return;
    lock.current = true;
    setBusy(true);
    try {
      const parsed = JSON.parse(data);
      if (!parsed?.t) throw new Error('Invalid QR');
      const res = await scanQr(parsed.t);
      if (res?.balanceInsufficient) {
        Alert.alert('Balans yetarli emas', res.message ?? 'Dars uchun balansingiz yetmadi');
      } else {
        await queryClient.invalidateQueries({ queryKey: ['attendance'] });
        Alert.alert('Belgilandi ✓', 'Davomat muvaffaqiyatli belgilandi');
      }
    } catch (error) {
      Alert.alert('Xatolik', getErrorMessage(error, 'QR kod yaroqsiz yoki muddati tugagan'));
    } finally {
      setBusy(false);
      router.back();
    }
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={busy ? undefined : onScanned}
      />
      <View className="absolute inset-x-0 bottom-12 items-center gap-3 px-6">
        <Text className="text-center text-base text-white">Dars QR kodiga qarating</Text>
        <Button label="Bekor qilish" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}
