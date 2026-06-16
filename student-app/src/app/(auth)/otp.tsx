import { useState } from 'react';
import { Alert, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useMutation } from '@tanstack/react-query';

import { Button, Input, Screen, Text } from '@/design/components';
import { exchangeOtp } from '@/api/auth';
import { useAuth } from '@/auth/auth-store';
import { getErrorMessage } from '@/lib/get-error-message';
import { env } from '@/config/env';

// ?start=applogin → the bot auto-sends a one-time code (no menu tap needed).
const BOT_URL = `https://t.me/${env.botUsername}?start=applogin`;

export default function Otp() {
  const [code, setCode] = useState('');
  const signIn = useAuth((s) => s.signIn);

  const mutation = useMutation({
    mutationFn: () => exchangeOtp(code),
    onSuccess: (data) => signIn(data.accessToken, data.refreshToken),
    onError: (error) => Alert.alert('Xatolik', getErrorMessage(error)),
  });

  return (
    <Screen className="justify-center px-6">
      <View className="gap-6">
        <View className="gap-2">
          <Text variant="heading">Telegram orqali kirish</Text>
          <Text variant="muted">
            1. “Telegramni ochish” tugmasini bosing va botda <Text variant="label">START</Text> tugmasini bosing{'\n'}
            2. Bot yuborgan 6 xonali kodni quyiga kiriting
          </Text>
        </View>

        <Button label="Telegramni ochish" onPress={() => Linking.openURL(BOT_URL)} />

        <View className="gap-2">
          <Text variant="label">Tasdiqlash kodi</Text>
          <Input
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder="000000"
            maxLength={6}
          />
        </View>

        <Button
          label="Kirish"
          variant="secondary"
          loading={mutation.isPending}
          disabled={code.length < 4}
          onPress={() => mutation.mutate()}
        />
      </View>
    </Screen>
  );
}
