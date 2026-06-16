import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';

import { Button, Input, Screen, Text } from '@/design/components';
import { login } from '@/api/auth';
import { useAuth } from '@/auth/auth-store';
import { getErrorMessage } from '@/lib/get-error-message';
import { t } from '@/i18n/uz';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const signIn = useAuth((s) => s.signIn);

  const mutation = useMutation({
    mutationFn: () => login(phone, password),
    onSuccess: (data) => signIn(data.accessToken, data.refreshToken),
    onError: (error) => Alert.alert('Kirish xatosi', getErrorMessage(error)),
  });

  const canSubmit = phone.length === 9 && password.length >= 1;

  return (
    <Screen className="justify-center px-6">
      <View className="gap-6">
        <View className="gap-2">
          <Text variant="heading">{t.auth.login}</Text>
          <Text variant="muted">DAF Sprachzentrum — o&apos;quvchi kabineti</Text>
        </View>

        <View className="gap-3">
          <View className="gap-1.5">
            <Text variant="label">{t.auth.phoneLabel}</Text>
            <Input
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 9))}
              keyboardType="phone-pad"
              placeholder={t.auth.phonePlaceholder}
              autoCapitalize="none"
            />
          </View>
          <View className="gap-1.5">
            <Text variant="label">Parol</Text>
            <Input value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••" />
          </View>
        </View>

        <Button
          label={t.auth.login}
          loading={mutation.isPending}
          disabled={!canSubmit}
          onPress={() => mutation.mutate()}
        />

        <View className="gap-2">
          <Text variant="muted" className="text-center">yoki</Text>
          <Button
            label="Telegram orqali kirish"
            variant="secondary"
            onPress={() => router.push('/otp')}
          />
        </View>
      </View>
    </Screen>
  );
}
