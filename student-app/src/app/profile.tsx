import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from '@tanstack/react-query';

import { ActionSheet, Avatar, Card, Loading, Screen, StackHeader, Text } from '@/design/components';
import { useProfile } from '@/api/queries/use-profile';
import { deletePhoto, uploadPhoto } from '@/api/profile';
import { formatPhone } from '@/lib/format';
import { getErrorMessage } from '@/lib/get-error-message';
import { useT } from '@/i18n';

function Row({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  if (!value) return null;
  return (
    <View className={`flex-row items-center justify-between py-3 ${last ? '' : 'border-b border-border'}`}>
      <Text variant="muted">{label}</Text>
      <Text variant="label" className="flex-1 text-right">{value}</Text>
    </View>
  );
}

export default function Profile() {
  const t = useT();
  const q = useProfile();
  const [sheetOpen, setSheetOpen] = useState(false);

  const photoMut = useMutation({
    mutationFn: (uri: string) => uploadPhoto(uri),
    onSuccess: () => q.refetch(),
    onError: (error) => Alert.alert(t.common.errorTitle, getErrorMessage(error)),
  });

  const deleteMut = useMutation({
    mutationFn: () => deletePhoto(),
    onSuccess: () => q.refetch(),
    onError: (error) => Alert.alert(t.common.errorTitle, getErrorMessage(error)),
  });

  const photoBusy = photoMut.isPending || deleteMut.isPending;

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!res.canceled && res.assets[0]?.uri) photoMut.mutate(res.assets[0].uri);
  }

  async function pickFromCamera() {
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!res.canceled && res.assets[0]?.uri) photoMut.mutate(res.assets[0].uri);
  }

  if (q.isLoading) return <Screen><Loading /></Screen>;
  const p = q.data;
  const initials = p ? `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() : '';

  return (
    <Screen>
      <StackHeader title={t.tabs.profile} />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-4 p-5 pt-2">
          {p ? (
            <Card className="items-center gap-3">
              <Pressable onPress={() => setSheetOpen(true)} disabled={photoBusy} className="items-center gap-2 active:opacity-80">
                <View>
                  <Avatar uri={p.photo} initials={initials} size={96} />
                  <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-coral-500">
                    <Ionicons name="camera" size={15} color="#FFFFFF" />
                  </View>
                </View>
                <Text variant="muted">{photoBusy ? t.profile.uploading : t.profile.changePhoto}</Text>
              </Pressable>

              <Text variant="title">{`${p.firstName} ${p.lastName}`.trim()}</Text>

              <View className="w-full">
                <Row label={t.profile.phone} value={formatPhone(p.phone)} />
                <Row label={t.profile.login} value={p.login} />
                <Row label={t.profile.telegram} value={p.telegram} />
                <Row label={t.profile.branch} value={p.branches.map((b) => b.name).join(', ') || null} last />
              </View>
            </Card>
          ) : null}
        </View>
      </ScrollView>

      <ActionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t.profile.photoSheetTitle}
        options={[
          { label: t.profile.pickGallery, icon: 'images-outline', onPress: pickFromLibrary },
          { label: t.profile.pickCamera, icon: 'camera-outline', onPress: pickFromCamera },
          ...(p?.photo
            ? [{ label: t.profile.deletePhoto, icon: 'trash-outline' as const, onPress: () => deleteMut.mutate(), destructive: true }]
            : []),
        ]}
      />
    </Screen>
  );
}
