import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';

import { Button, Input, Screen, Text } from '@/design/components';
import { exchangeOtp } from '@/api/auth';
import { useAuth } from '@/auth/auth-store';
import { getErrorMessage } from '@/lib/get-error-message';
import { t } from '@/i18n/uz';

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
          <Text variant="heading">{t.auth.otpTitle}</Text>
          <Text variant="muted">{t.auth.otpHint}</Text>
        </View>

        <Input
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          placeholder="000000"
          maxLength={6}
        />

        <Button
          label={t.auth.login}
          loading={mutation.isPending}
          disabled={code.length < 4}
          onPress={() => mutation.mutate()}
        />
      </View>
    </Screen>
  );
}
