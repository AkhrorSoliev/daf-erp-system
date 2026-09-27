import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';

import { Button, Card, IconTile, Input, ProgressBar, Screen, Text } from '@/design/components';
import { useColors } from '@/design/colors';
import { tokens } from '@/design/tokens';
import { cn } from '@/lib/cn';
import { sendChangeCode, sendPhoneCode, updateOnboardingProfile, verifyPhoneCode } from '@/api/onboarding';
import { onboardingKey, useOnboarding } from '@/api/queries/use-onboarding';
import type { OnboardingStatus } from '@/api/types';
import { useAuth } from '@/auth/auth-store';
import { formatPhone } from '@/lib/format';
import { getErrorMessage } from '@/lib/get-error-message';
import { MAX_STUDENT_AGE, MIN_STUDENT_AGE, maskBirthDate, parseBirthDate } from '@/lib/birth-date';
import { useT } from '@/i18n';

type Stage = 'PHONE' | 'PROFILE';

function stagesOf(status: OnboardingStatus): Stage[] {
  const stages: Stage[] = [];
  if (status.missing.includes('PHONE')) stages.push('PHONE');
  if (status.missing.some((s) => s !== 'PHONE')) stages.push('PROFILE');
  return stages;
}

/**
 * The only screen a signed-in student can reach until ADR-0039's steps are
 * done: the phone proved by SMS, gender and birth date. The root layout's
 * `Stack.Protected` guard routes here; when the last step's answer lands in
 * the cache the guard flips and the tabs open.
 */
export default function Onboarding() {
  const t = useT();
  const c = t.onboarding;
  const queryClient = useQueryClient();
  const signOut = useAuth((s) => s.signOut);
  const { data: status } = useOnboarding(true);
  // Fixed when the screen opens, so "2 / 2" still reads right after the first
  // stage has left `missing`. The guard routes here only once the status is in
  // the cache, so it is there on the first render.
  const [total] = useState(() => (status ? stagesOf(status).length : 0));

  if (!status) return <Screen />;

  const stages = stagesOf(status);
  const shownTotal = total || stages.length;
  const position = shownTotal - stages.length + 1;

  function handleDone(next: OnboardingStatus) {
    queryClient.setQueryData(onboardingKey, next);
    // Gender and birth date also show on the profile screen.
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
  }

  async function logout() {
    await signOut();
    queryClient.clear();
  }

  return (
    <Screen>
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View className="gap-5 p-6 pb-12">
          <View className="gap-1">
            <Text variant="label" className="text-fg-muted">
              {shownTotal > 1 ? c.stepOf(position, shownTotal) : c.lastStep}
            </Text>
            <Text variant="heading">{c.title}</Text>
            <Text variant="muted">{c.subtitle}</Text>
          </View>

          {shownTotal > 1 ? (
            <ProgressBar
              height={10}
              segments={[
                { value: position, color: tokens.color.primary },
                { value: shownTotal - position, color: 'transparent' },
              ]}
            />
          ) : null}

          <Card className="gap-5">
            {stages[0] === 'PHONE' ? (
              <PhoneStep phone={status.phone} onDone={handleDone} />
            ) : (
              <ProfileStep
                needGender={status.missing.includes('GENDER')}
                needBirthDate={status.missing.includes('BIRTH_DATE')}
                onDone={handleDone}
              />
            )}
          </Card>

          <Button label={c.logout} variant="ghost" onPress={logout} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function StepHeader({
  icon,
  tone,
  title,
  hint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'sky' | 'grape';
  title: string;
  hint: string;
}) {
  return (
    <View className="flex-row items-start gap-3">
      <IconTile icon={icon} tone={tone} size={48} />
      <View className="flex-1 gap-1">
        <Text variant="title">{title}</Text>
        <Text variant="muted">{hint}</Text>
      </View>
    </View>
  );
}

function StepError({ message }: { message: string }) {
  return message ? (
    <Text accessibilityRole="alert" className="font-bodymd text-danger">
      {message}
    </Text>
  ) : null;
}

// Proves the student's phone by SMS (ADR-0039). First it asks whether the
// number on the card is theirs: «Ha» sends the code there; «Yo'q» takes the
// number they actually use, behind their current password (a sign-in key
// changes only with it — ADR-0031). That code goes to the new number and,
// proved, the new number replaces the card's: they sign in with it from then on.
function PhoneStep({ phone, onDone }: { phone: string; onDone: (s: OnboardingStatus) => void }) {
  const t = useT();
  const c = t.onboarding;
  const [stage, setStage] = useState<'ask' | 'other' | 'code'>('ask');
  const [target, setTarget] = useState<'card' | 'other'>('card');
  const [newPhone, setNewPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function onSend(to: 'card' | 'other') {
    if (busy || cooldown > 0) return;
    if (to === 'other') {
      if (newPhone.length !== 9) return setError(c.errPhone);
      if (!password) return setError(c.errPassword);
    }
    setError('');
    setBusy('send');
    try {
      const { resendInSec } = to === 'card' ? await sendPhoneCode() : await sendChangeCode(newPhone, password);
      setTarget(to);
      setStage('code');
      setCode('');
      setCooldown(resendInSec);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function onVerify() {
    if (code.length !== 4) return setError(c.errCode);
    setError('');
    setBusy('verify');
    try {
      const next = await verifyPhoneCode(code);
      if (next.phone !== phone) {
        Alert.alert(c.phoneChangedTitle, c.phoneChanged(formatPhone(next.phone)));
      }
      onDone(next);
    } catch (e) {
      setError(getErrorMessage(e, c.errCode));
      setCode('');
    } finally {
      setBusy(null);
    }
  }

  function backToQuestion() {
    setStage('ask');
    setCode('');
    setPassword('');
    setError('');
  }

  const hint =
    stage === 'code'
      ? c.sentTo(formatPhone(target === 'card' ? phone : newPhone))
      : stage === 'other'
        ? c.otherHint
        : c.currentNumber;

  return (
    <View className="gap-5">
      <StepHeader icon="chatbubble-ellipses" tone="sky" title={c.phoneTitle} hint={hint} />

      {stage === 'ask' ? (
        <View className="gap-4">
          <View className="items-center gap-1 rounded-md bg-sunk px-4 py-3">
            <Text variant="title">{formatPhone(phone)}</Text>
            <Text variant="muted">{c.isYours}</Text>
          </View>
          <StepError message={error} />
          <Button label={c.yesSend} loading={busy === 'send'} onPress={() => onSend('card')} />
          <Button
            label={c.noOther}
            variant="secondary"
            disabled={busy !== null}
            onPress={() => {
              setError('');
              setStage('other');
            }}
          />
        </View>
      ) : null}

      {stage === 'other' ? (
        <View className="gap-4">
          <View className="gap-1.5">
            <Text variant="label">{c.newPhoneLabel}</Text>
            <Input
              value={newPhone}
              onChangeText={(v) => setNewPhone(v.replace(/\D/g, '').slice(0, 9))}
              keyboardType="phone-pad"
              placeholder={t.auth.phonePlaceholder}
              autoCapitalize="none"
            />
          </View>
          <View className="gap-1.5">
            <Text variant="label">{c.currentPasswordLabel}</Text>
            <Input value={password} onChangeText={setPassword} secureTextEntry placeholder={t.auth.passwordPlaceholder} />
          </View>
          <Text variant="muted" className="text-[13px]">
            {c.changeNote}
          </Text>
          <StepError message={error} />
          <Button label={c.sendCode} loading={busy === 'send'} onPress={() => onSend('other')} />
          <Button label={c.back} variant="ghost" size="sm" disabled={busy !== null} onPress={backToQuestion} />
        </View>
      ) : null}

      {stage === 'code' ? (
        <View className="gap-4">
          <View className="gap-1.5">
            <Text variant="label">{c.codeLabel}</Text>
            <Input
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              placeholder="••••"
              maxLength={4}
              autoFocus
              className="text-center text-[20px] tracking-[8px]"
            />
          </View>
          <StepError message={error} />
          <Button label={c.verify} loading={busy === 'verify'} disabled={code.length !== 4 || busy === 'send'} onPress={onVerify} />
          <Button
            label={cooldown > 0 ? c.resendIn(cooldown) : c.resend}
            variant="ghost"
            size="sm"
            disabled={cooldown > 0 || busy !== null}
            onPress={() => onSend(target)}
          />
          <Button label={c.back} variant="ghost" size="sm" disabled={busy !== null} onPress={backToQuestion} />
        </View>
      ) : null}

      <Text variant="muted" className="text-center text-[13px]">
        {c.noSms}
      </Text>
    </View>
  );
}

// Gender and birth date in one step, asking only for what the card lacks. The
// server writes only empty fields, so what staff entered is never overwritten.
function ProfileStep({
  needGender,
  needBirthDate,
  onDone,
}: {
  needGender: boolean;
  needBirthDate: boolean;
  onDone: (s: OnboardingStatus) => void;
}) {
  const t = useT();
  const c = t.onboarding;
  const colors = useColors();
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const parsed = parseBirthDate(birthDate);

  const REASON: Record<'format' | 'invalid' | 'future' | 'age', string> = {
    format: c.errBirthDate,
    invalid: c.errBirthDateInvalid,
    future: c.errBirthDateFuture,
    age: c.errAge(MIN_STUDENT_AGE, MAX_STUDENT_AGE),
  };

  async function onSave() {
    if (needGender && !gender) return setError(c.errGender);
    if (needBirthDate && !parsed.ok) return setError(REASON[parsed.reason]);
    setError('');
    setBusy(true);
    try {
      onDone(
        await updateOnboardingProfile({
          ...(needGender && gender ? { gender } : {}),
          ...(needBirthDate && parsed.ok ? { dateOfBirth: parsed.iso } : {}),
        }),
      );
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const options = [
    { value: 'MALE' as const, label: c.male, icon: 'male' as const },
    { value: 'FEMALE' as const, label: c.female, icon: 'female' as const },
  ];

  return (
    <View className="gap-5">
      <StepHeader icon="person" tone="grape" title={c.profileTitle} hint={c.profileHint} />

      {needGender ? (
        <View className="gap-1.5">
          <Text variant="label">{c.genderLabel}</Text>
          <View className="flex-row gap-3">
            {options.map((o) => {
              const active = gender === o.value;
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole="radio"
                  accessibilityLabel={o.label}
                  accessibilityState={{ checked: active }}
                  onPress={() => setGender(o.value)}
                  className={cn(
                    'h-[56px] flex-1 flex-row items-center justify-center gap-2 rounded-md border-2',
                    active ? 'border-coral-500 bg-coral-50 dark:bg-coral-500/20' : 'border-border bg-surface',
                  )}
                >
                  <Ionicons name={o.icon} size={20} color={active ? tokens.color.primary : colors.fgBody} />
                  <Text variant="bodyStrong" className={active ? 'text-coral-600' : undefined}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {needBirthDate ? (
        <View className="gap-1.5">
          <Text variant="label">{c.birthDateLabel}</Text>
          <Input
            value={birthDate}
            onChangeText={(v) => setBirthDate(maskBirthDate(v))}
            keyboardType="number-pad"
            placeholder={c.birthDatePlaceholder}
            maxLength={10}
          />
          {parsed.ok ? <Text variant="muted">{c.age(parsed.age)}</Text> : null}
        </View>
      ) : null}

      <StepError message={error} />
      <Button label={c.save} loading={busy} onPress={onSave} />
    </View>
  );
}
