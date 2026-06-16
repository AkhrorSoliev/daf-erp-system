import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ActionSheet, Button, Card, Loading, Screen, Text } from '@/design/components';
import { useProfile } from '@/api/queries/use-profile';
import { uploadPhoto } from '@/api/profile';
import { useAuth } from '@/auth/auth-store';
import { formatPhone } from '@/lib/format';
import { getErrorMessage } from '@/lib/get-error-message';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/uz';

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View className="flex-row items-center justify-between py-2.5">
      <Text variant="muted">{label}</Text>
      <Text variant="label">{value}</Text>
    </View>
  );
}

const AVATAR = 96;

export default function Profile() {
  const q = useProfile();
  const signOut = useAuth((s) => s.signOut);
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);

  const photoMut = useMutation({
    mutationFn: (uri: string) => uploadPhoto(uri),
    onSuccess: () => q.refetch(),
    onError: (error) => Alert.alert('Xatolik', getErrorMessage(error)),
  });

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!res.canceled && res.assets[0]?.uri) photoMut.mutate(res.assets[0].uri);
  }

  async function pickFromCamera() {
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!res.canceled && res.assets[0]?.uri) photoMut.mutate(res.assets[0].uri);
  }

  if (q.isLoading) return <Screen edges={['top']}><Loading /></Screen>;
  const p = q.data;
  const initials = p ? `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() : '';

  return (
    <Screen edges={['top']}>
      <ScrollView className="flex-1">
        <View className="gap-4 p-4">
          <Text variant="heading">{t.tabs.profile}</Text>
          {p ? (
            <Card className="items-center gap-3">
              <Pressable
                onPress={() => setSheetOpen(true)}
                disabled={photoMut.isPending}
                className="items-center gap-2 active:opacity-80"
              >
                <View style={{ width: AVATAR, height: AVATAR }}>
                  {p.photo ? (
                    <Image
                      source={{ uri: p.photo }}
                      style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }}
                    />
                  ) : (
                    <View
                      className="items-center justify-center bg-primary"
                      style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }}
                    >
                      <Text className="text-3xl font-bold text-primary-fg">{initials || '?'}</Text>
                    </View>
                  )}
                  {/* camera badge — signals the avatar is tappable */}
                  <View
                    className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2 border-bg bg-primary"
                  >
                    <Ionicons name="camera" size={16} color={tokens.color.primaryFg} />
                  </View>
                </View>
                <Text variant="muted">{photoMut.isPending ? 'Yuklanmoqda...' : 'Rasmni o‘zgartirish'}</Text>
              </Pressable>

              <Text variant="title">{`${p.firstName} ${p.lastName}`.trim()}</Text>

              <View className="w-full">
                <Row label="Telefon" value={formatPhone(p.phone)} />
                <Row label="Login" value={p.login} />
                <Row label="Telegram" value={p.telegram} />
                <Row label="Filial" value={p.branches.map((b) => b.name).join(', ') || null} />
              </View>
            </Card>
          ) : null}
        </View>
      </ScrollView>

      <View className="p-4">
        <Button
          label="Chiqish"
          variant="danger"
          onPress={async () => {
            await signOut();
            queryClient.clear();
          }}
        />
      </View>

      <ActionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Profil rasmi"
        options={[
          { label: 'Galereyadan tanlash', onPress: pickFromLibrary },
          { label: 'Kameradan olish', onPress: pickFromCamera },
        ]}
      />
    </Screen>
  );
}
