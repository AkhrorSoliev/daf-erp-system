import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';

import { Button, Card, EmptyState, Input, Loading, Screen, Text } from '@/design/components';
import { useProfile } from '@/api/queries/use-profile';
import { usePayments } from '@/api/queries/use-payments';
import { initPayment, MIN_PAYMENT, QUICK_AMOUNTS, type PaymentMethod } from '@/api/payments';
import { formatDate, formatSom } from '@/lib/format';
import { paymentMethodLabel } from '@/lib/labels';
import { getErrorMessage } from '@/lib/get-error-message';
import { cn } from '@/lib/cn';
import { t } from '@/i18n/uz';

export default function Payments() {
  const profile = useProfile();
  const pay = usePayments();
  const [amount, setAmount] = useState(0);

  const initMut = useMutation({
    mutationFn: (method: PaymentMethod) => initPayment(method, amount),
    onSuccess: async (checkoutUrl) => {
      await WebBrowser.openBrowserAsync(checkoutUrl);
      // The gateway webhook credits the balance server-side; refetch on return.
      profile.refetch();
      pay.refetch();
    },
    onError: (error) => Alert.alert('Xatolik', getErrorMessage(error)),
  });

  if (profile.isLoading || pay.isLoading) return <Screen edges={['top']}><Loading /></Screen>;

  const balance = profile.data?.balance ?? 0;
  const payments = pay.data?.payments ?? [];
  const refreshing = profile.isRefetching || pay.isRefetching;
  const canPay = amount >= MIN_PAYMENT && !initMut.isPending;

  return (
    <Screen edges={['top']}>
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              profile.refetch();
              pay.refetch();
            }}
          />
        }
      >
        <View className="gap-4 p-4">
          <Text variant="heading">{t.tabs.payments}</Text>

          <Card>
            <Text variant="muted">{t.home.balance}</Text>
            <Text variant="heading" className={balance < 0 ? 'mt-1 text-danger' : 'mt-1 text-success'}>
              {formatSom(balance)}
            </Text>
          </Card>

          <Card className="gap-3">
            <Text variant="title">Balansni to&apos;ldirish</Text>
            <Input
              value={amount ? String(amount) : ''}
              onChangeText={(v) => setAmount(Number(v.replace(/\D/g, '')) || 0)}
              keyboardType="number-pad"
              placeholder="Summa (so'm)"
            />
            <View className="flex-row flex-wrap gap-2">
              {QUICK_AMOUNTS.map((a) => (
                <Pressable
                  key={a}
                  onPress={() => setAmount(a)}
                  className={cn(
                    'rounded-button border border-border px-3 py-2',
                    amount === a && 'border-primary bg-surface',
                  )}
                >
                  <Text variant="muted">{formatSom(a)}</Text>
                </Pressable>
              ))}
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button label="Payme" disabled={!canPay} loading={initMut.isPending} onPress={() => initMut.mutate('PAYME')} />
              </View>
              <View className="flex-1">
                <Button label="Click" variant="secondary" disabled={!canPay} onPress={() => initMut.mutate('CLICK')} />
              </View>
            </View>
            <Text variant="muted">To&apos;lovdan keyin balans bir necha soniyada yangilanadi.</Text>
          </Card>

          <View className="gap-2">
            <Text variant="title">To&apos;lovlar tarixi</Text>
            {payments.length === 0 ? (
              <EmptyState title="To'lovlar yo'q" />
            ) : (
              payments.map((p) => (
                <Card key={p.id} className="flex-row items-center justify-between py-3">
                  <View>
                    <Text variant="label">{formatSom(p.amount)}</Text>
                    <Text variant="muted">
                      {paymentMethodLabel(p.method)} · {formatDate(p.createdAt)}
                    </Text>
                  </View>
                </Card>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
