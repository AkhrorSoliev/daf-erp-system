import { useState } from 'react';
import { View } from 'react-native';

import { Button, Input, Screen, Text } from '@/design/components';
import { useAuth } from '@/auth/auth-store';
import { t } from '@/i18n/uz';

export default function Otp() {
  const [code, setCode] = useState('');
  const setSession = useAuth((s) => s.setSession);

  async function onSubmit() {
    // Phase 0 STUB. Phase 1 replaces this with POST /auth/otp/exchange -> { user, accessToken, refreshToken }.
    await setSession(
      { id: 0, studentId: 0, firstName: 'Talaba', lastName: '', phone: '', balance: 0 },
      'demo-access',
      'demo-refresh',
    );
  }

  return (
    <Screen className="justify-center px-6">
      <View className="gap-6">
        <View className="gap-2">
          <Text variant="heading">{t.auth.otpTitle}</Text>
          <Text variant="muted">{t.auth.otpHint}</Text>
        </View>

        <Input
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          placeholder="0000"
          maxLength={6}
        />

        <Button label={t.auth.login} disabled={code.length < 4} onPress={onSubmit} />
      </View>
    </Screen>
  );
}
