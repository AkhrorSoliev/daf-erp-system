import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Input, Screen, StackHeader, Text } from '@/design/components';
import {
  requestPasswordReset,
  verifyResetCode,
  resetPasswordWithToken,
} from '@/api/auth';
import { getErrorMessage } from '@/lib/get-error-message';
import { useT } from '@/i18n';

const RESEND_SECONDS = 60;

export default function ForgotPassword() {
  const t = useT();
  const c = t.forgotPassword;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function sendCode() {
    setError('');
    setBusy(true);
    try {
      await requestPasswordReset(phone);
      setStep(2);
      setCooldown(RESEND_SECONDS);
    } catch {
      setError(t.common.error);
    } finally {
      setBusy(false);
    }
  }

  async function onRequest() {
    if (phone.length !== 9) return setError(c.errPhone);
    await sendCode();
  }

  async function onVerify() {
    setError('');
    if (code.length !== 4) return setError(c.errCode);
    setBusy(true);
    try {
      const { resetToken: token } = await verifyResetCode(phone, code);
      setResetToken(token);
      setStep(3);
    } catch (e) {
      setError(getErrorMessage(e, c.errCode));
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    setError('');
    if (newPassword.length < 6) return setError(c.errPassword);
    if (newPassword !== confirmPassword) return setError(c.errMismatch);
    setBusy(true);
    try {
      await resetPasswordWithToken(resetToken, newPassword);
      Alert.alert(c.successTitle, c.successMessage, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <StackHeader title={c.title} />
      <View className="gap-6 px-6 pt-4">
        <Text variant="muted">
          {step === 1 ? c.step1Hint : step === 2 ? c.step2Hint : c.step3Hint}
        </Text>

        {error ? (
          <Text className="text-center text-danger">{error}</Text>
        ) : null}

        {step === 1 && (
          <View className="gap-4">
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
            <Button
              label={c.sendCode}
              loading={busy}
              disabled={phone.length !== 9}
              onPress={onRequest}
            />
          </View>
        )}

        {step === 2 && (
          <View className="gap-4">
            <View className="gap-1.5">
              <Text variant="label">{c.codeLabel}</Text>
              <Input
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                placeholder="••••"
                maxLength={4}
              />
            </View>
            <Button
              label={c.verify}
              loading={busy}
              disabled={code.length !== 4}
              onPress={onVerify}
            />
            <View className="flex-row items-center justify-between">
              <Button
                label={c.changeNumber}
                variant="ghost"
                size="sm"
                onPress={() => {
                  setStep(1);
                  setCode('');
                  setError('');
                }}
              />
              <Button
                label={
                  cooldown > 0 ? `${c.resend} (${cooldown}s)` : c.resend
                }
                variant="ghost"
                size="sm"
                disabled={cooldown > 0 || busy}
                onPress={sendCode}
              />
            </View>
          </View>
        )}

        {step === 3 && (
          <View className="gap-4">
            <View className="gap-1.5">
              <Text variant="label">{c.newPasswordLabel}</Text>
              <Input
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder={c.newPasswordPlaceholder}
              />
            </View>
            <View className="gap-1.5">
              <Text variant="label">{c.confirmPasswordLabel}</Text>
              <Input
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder={c.newPasswordPlaceholder}
              />
            </View>
            <Button
              label={c.save}
              loading={busy}
              disabled={newPassword.length < 6 || confirmPassword.length < 6}
              onPress={onReset}
            />
          </View>
        )}
      </View>
    </Screen>
  );
}
