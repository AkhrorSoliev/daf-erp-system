import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import * as Linking from 'expo-linking';
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';

import { Button, Input, Screen, Text } from '@/design/components';
import { login, pollLoginRequest } from '@/api/auth';
import { useAuth } from '@/auth/auth-store';
import { getErrorMessage } from '@/lib/get-error-message';
import { env } from '@/config/env';
import { t } from '@/i18n/uz';

const POLL_INTERVAL = 2500;
const POLL_TIMEOUT = 3 * 60 * 1000;

export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [tgWaiting, setTgWaiting] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const signIn = useAuth((s) => s.signIn);

  const loginMut = useMutation({
    mutationFn: () => login(phone, password),
    onSuccess: (data) => signIn(data.accessToken, data.refreshToken),
    onError: (error) => Alert.alert('Kirish xatosi', getErrorMessage(error)),
  });

  function botUrl() {
    return `https://t.me/${env.botUsername}?start=req_${requestIdRef.current}`;
  }

  function startTelegram() {
    requestIdRef.current = Crypto.randomUUID();
    setTgWaiting(true);
    Linking.openURL(botUrl()).catch(() => {});
  }

  // While waiting, poll the backend until the bot approves the request.
  useEffect(() => {
    if (!tgWaiting) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();

    const tick = async () => {
      if (!active) return;
      if (Date.now() - started > POLL_TIMEOUT) {
        setTgWaiting(false);
        Alert.alert('Vaqt tugadi', "Qayta urinib ko'ring");
        return;
      }
      try {
        const res = await pollLoginRequest(requestIdRef.current ?? '');
        if (res.status === 'approved') {
          active = false;
          await signIn(res.accessToken, res.refreshToken);
          return;
        }
      } catch {
        // transient — keep polling
      }
      if (active) timer = setTimeout(tick, POLL_INTERVAL);
    };

    timer = setTimeout(tick, POLL_INTERVAL);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tgWaiting, signIn]);

  if (tgWaiting) {
    return (
      <Screen className="justify-center px-6">
        <View className="items-center gap-6">
          <ActivityIndicator />
          <View className="gap-2">
            <Text variant="heading" className="text-center">
              Telegram&apos;da tasdiqlang
            </Text>
            <Text variant="muted" className="text-center">
              Botda <Text variant="label">START</Text> tugmasini bosing — tasdiqlangach avtomatik kirasiz.
            </Text>
          </View>
          <View className="w-full gap-2">
            <Button label="Telegramni qayta ochish" onPress={() => Linking.openURL(botUrl())} />
            <Button label="Bekor qilish" variant="ghost" onPress={() => setTgWaiting(false)} />
          </View>
        </View>
      </Screen>
    );
  }

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
          loading={loginMut.isPending}
          disabled={!canSubmit}
          onPress={() => loginMut.mutate()}
        />

        <View className="gap-2">
          <Text variant="muted" className="text-center">yoki</Text>
          <Button label="Telegram orqali kirish" variant="secondary" onPress={startTelegram} />
        </View>
      </View>
    </Screen>
  );
}
