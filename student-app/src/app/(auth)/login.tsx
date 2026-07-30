import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';

import { Button, Input, Screen, Text } from '@/design/components';
import { clay } from '@/design/shadows';
import { tokens } from '@/design/tokens';
import { login, pollLoginRequest } from '@/api/auth';
import { useAuth } from '@/auth/auth-store';
import { getErrorMessage } from '@/lib/get-error-message';
import { env } from '@/config/env';
import { t } from '@/i18n/uz';

// SMS password reset for students. Eskiz account is active with approved
// template 78093; per Eskiz support a brand nik is not required to deliver it,
// so ESKIZ_FROM stays 4546. See memory: project_eskiz_sms_setup.
const SMS_PASSWORD_RESET_ENABLED = true;

const POLL_INTERVAL = 2500;
const POLL_TIMEOUT = 3 * 60 * 1000;

function BrandMark() {
  return (
    <View className="items-center gap-3">
      <View className="h-16 w-16 items-center justify-center rounded-2xl bg-coral-500" style={{ boxShadow: clay.coral }}>
        <Ionicons name="flash" size={32} color="#FFFFFF" />
      </View>
      <Text variant="title">DAF Student</Text>
    </View>
  );
}

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
          <ActivityIndicator color={tokens.color.primary} />
          <View className="gap-2">
            <Text variant="heading" className="text-center">
              Telegram&apos;da tasdiqlang
            </Text>
            <Text variant="muted" className="text-center">
              Botda <Text variant="label">START</Text> tugmasini bosing — tasdiqlangach avtomatik kirasiz.
            </Text>
          </View>
          <View className="w-full gap-2.5">
            <Button label="Telegramni qayta ochish" iconBefore="paper-plane" onPress={() => Linking.openURL(botUrl())} />
            <Button label="Bekor qilish" variant="ghost" onPress={() => setTgWaiting(false)} />
          </View>
        </View>
      </Screen>
    );
  }

  // Chet el raqamlari ham qabul qilinadi (E.164 → 8..15 raqam), shu sababli
  // aynan 9 xona talab qilinmaydi. Normalizatsiya serverda.
  const canSubmit = phone.replace(/\D/g, '').length >= 8 && password.length >= 1;

  return (
    <Screen className="justify-center px-6">
      <View className="gap-7">
        <BrandMark />

        <View className="gap-1">
          <Text variant="heading" className="text-center">{t.auth.login}</Text>
          <Text variant="muted" className="text-center">DAF Sprachzentrum — o&apos;quvchi kabineti</Text>
        </View>

        <View className="gap-3">
          <View className="gap-1.5">
            <Text variant="label">{t.auth.phoneLabel}</Text>
            <Input
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder={t.auth.loginPhonePlaceholder}
              autoCapitalize="none"
            />
          </View>
          <View className="gap-1.5">
            <Text variant="label">Parol</Text>
            <Input value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••" />
          </View>
        </View>

        <Button label={t.auth.login} loading={loginMut.isPending} disabled={!canSubmit} onPress={() => loginMut.mutate()} />

        {SMS_PASSWORD_RESET_ENABLED && (
          <Button
            label={t.auth.forgot}
            variant="ghost"
            size="sm"
            onPress={() => router.push('/forgot-password')}
          />
        )}

        <View className="gap-3">
          <View className="flex-row items-center gap-3">
            <View className="h-px flex-1 bg-line" />
            <Text variant="muted">yoki</Text>
            <View className="h-px flex-1 bg-line" />
          </View>
          <Button label="Telegram orqali kirish" variant="secondary" iconBefore="paper-plane-outline" onPress={startTelegram} />
        </View>
      </View>
    </Screen>
  );
}
