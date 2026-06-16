import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Button, Input, Screen, Text } from '@/design/components';
import { t } from '@/i18n/uz';

export default function Login() {
  const [phone, setPhone] = useState('');

  return (
    <Screen className="justify-center px-6">
      <View className="gap-6">
        <View className="gap-2">
          <Text variant="heading">{t.auth.login}</Text>
          <Text variant="muted">{t.auth.otpHint}</Text>
        </View>

        <View className="gap-2">
          <Text variant="label">{t.auth.phoneLabel}</Text>
          <Input
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder={t.auth.phonePlaceholder}
            maxLength={9}
          />
        </View>

        <Button label={t.auth.continue} disabled={phone.length < 9} onPress={() => router.push('/otp')} />
      </View>
    </Screen>
  );
}
