import { ScrollView, View } from 'react-native';
import { Card, FadeIn, Screen, StackHeader, Text } from '@/design/components';
import { useT } from '@/i18n';

export default function Faq() {
  const t = useT();
  return (
    <Screen>
      <StackHeader title={t.tabs.faq} />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-3 p-5 pt-2">
          {Object.values(t.faq).map((f, i) => (
            <FadeIn key={i} index={i}>
              <Card className="gap-1.5">
                <Text variant="h3">{f.q}</Text>
                <Text variant="body">{f.a}</Text>
              </Card>
            </FadeIn>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
