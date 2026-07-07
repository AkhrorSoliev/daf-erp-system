import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';

import { Button, Card, EmptyState, IconTile, Input, LoadingCards, Screen, StackHeader, Text } from '@/design/components';
import { tokens } from '@/design/tokens';
import { useProfile } from '@/api/queries/use-profile';
import { usePayments } from '@/api/queries/use-payments';
import { initPayment, MIN_PAYMENT, QUICK_AMOUNTS, type PaymentMethod } from '@/api/payments';
import { formatDate, formatSom } from '@/lib/format';
import { paymentMethodLabel } from '@/lib/labels';
import { getErrorMessage } from '@/lib/get-error-message';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n';

export default function Payments() {
  const t = useT();
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
    onError: (error) => Alert.alert(t.common.errorTitle, getErrorMessage(error)),
  });

  if (profile.isLoading || pay.isLoading) return <Screen><LoadingCards /></Screen>;

  const balance = profile.data?.balance ?? 0;
  const inDebt = balance < 0;
  const payments = pay.data?.payments ?? [];
  const refreshing = profile.isRefetching || pay.isRefetching;
  const canPay = amount >= MIN_PAYMENT && !initMut.isPending;

  return (
    <Screen>
      <StackHeader title={t.tabs.payments} />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={tokens.color.primary}
            onRefresh={() => {
              profile.refetch();
              pay.refetch();
            }}
          />
        }
      >
        <View className="gap-4 p-5 pt-2">
          <Card className="flex-row items-center justify-between">
            <View>
              <Text variant="caps">{t.home.balance}</Text>
              <Text variant="num" className={cn('mt-1 text-[28px]', inDebt ? 'text-danger' : 'text-success')}>
                {formatSom(balance)}
              </Text>
            </View>
            <IconTile icon="wallet" tone={inDebt ? 'coral' : 'teal'} size={48} />
          </Card>

          <Card className="gap-3.5">
            <Text variant="title">{t.payments.addBalance}</Text>
            <Input
              value={amount ? String(amount) : ''}
              onChangeText={(v) => setAmount(Number(v.replace(/\D/g, '')) || 0)}
              keyboardType="number-pad"
              placeholder={t.payments.amountPlaceholder}
            />
            <View className="flex-row flex-wrap gap-2">
              {QUICK_AMOUNTS.map((a) => {
                const active = amount === a;
                return (
                  <Pressable
                    key={a}
                    onPress={() => setAmount(a)}
                    className={cn(
                      'rounded-pill border px-3.5 py-2',
                      active ? 'border-coral-500 bg-coral-50 dark:bg-coral-500/15' : 'border-border bg-surface',
                    )}
                  >
                    <Text className={cn('font-bodymd text-[13px]', active ? 'text-coral-600 dark:text-coral-400' : 'text-fg-muted')}>
                      {formatSom(a)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button label="Payme" disabled={!canPay} loading={initMut.isPending} onPress={() => initMut.mutate('PAYME')} />
              </View>
              <View className="flex-1">
                <Button label="Click" variant="secondary" disabled={!canPay} onPress={() => initMut.mutate('CLICK')} />
              </View>
            </View>
            <Text variant="muted">{t.payments.afterPaymentNote}</Text>
          </Card>

          <View className="gap-2.5">
            <Text variant="title">{t.payments.history}</Text>
            {payments.length === 0 ? (
              <EmptyState icon="receipt-outline" title={t.payments.noPayments} />
            ) : (
              payments.map((p) => (
                <View
                  key={p.id}
                  className="flex-row items-center gap-3.5 rounded-card border border-border bg-surface px-4 py-3"
                >
                  <IconTile icon="cash" tone="teal" />
                  <View className="flex-1">
                    <Text variant="h3">{formatSom(p.amount)}</Text>
                    <Text variant="muted">
                      {paymentMethodLabel(p.method)} · {formatDate(p.createdAt)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
