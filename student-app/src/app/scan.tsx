import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useQueryClient } from '@tanstack/react-query';

import { Button, EmptyState, Loading, Screen, Text } from '@/design/components';
import { scanQr } from '@/api/attendance';
import { getErrorMessage } from '@/lib/get-error-message';
import { useT } from '@/i18n';

export default function Scan() {
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const queryClient = useQueryClient();

  if (!permission) return <Screen><Loading /></Screen>;

  if (!permission.granted) {
    return (
      <Screen className="justify-center px-6">
        <View className="gap-5">
          <EmptyState icon="camera-outline" title={t.scan.permissionTitle} description={t.scan.permissionDesc} />
          <View className="gap-2.5">
            <Button label={t.scan.allow} iconBefore="checkmark" onPress={requestPermission} />
            <Button label={t.common.back} variant="ghost" onPress={() => router.back()} />
          </View>
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
        Alert.alert(t.scan.insufficientTitle, res.message ?? t.scan.insufficientMessage);
      } else {
        await queryClient.invalidateQueries({ queryKey: ['attendance'] });
        Alert.alert(t.scan.markedTitle, t.scan.markedMessage);
      }
    } catch (error) {
      Alert.alert(t.common.errorTitle, getErrorMessage(error, t.scan.invalidQr));
    } finally {
      setBusy(false);
      router.back();
    }
  }

  return (
    <View className="flex-1 bg-ink-900">
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={busy ? undefined : onScanned}
      />

      {/* Scan frame guide */}
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="h-60 w-60 rounded-3xl border-2 border-white/80" />
      </View>

      <View className="absolute inset-x-0 bottom-14 items-center gap-3 px-6">
        <Text className="text-center font-bodymd text-[15px] text-white">{t.scan.guide}</Text>
        <Button label={t.common.cancel} variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}
