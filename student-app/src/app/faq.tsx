import { ScrollView, View } from 'react-native';
import { Card, Screen, StackHeader, Text } from '@/design/components';

const FAQ = [
  {
    q: "Balansni qanday to'ldiraman?",
    a: "Ko'proq → To'lovlar bo'limiga kiring, summani tanlang va Payme yoki Click orqali to'lang. Balans bir necha soniyada yangilanadi.",
  },
  {
    q: 'Davomat qanday belgilanadi?',
    a: "Darsga kelganingizda Asosiy sahifadagi «QR bilan belgilash» tugmasini bosib, dars QR kodini skanerlang.",
  },
  {
    q: "Balansim manfiy bo'lsa nima bo'ladi?",
    a: "Manfiy balans qarzdorlikni bildiradi. Darslarni davom ettirish uchun iltimos balansni to'ldiring.",
  },
  {
    q: 'Jadvalim va davomatim qayerda?',
    a: 'Asosiy sahifada balans, bugungi darslar va davomat ko\'rsatkichlari jamlangan.',
  },
  {
    q: "Profil rasmini qanday o'zgartiraman?",
    a: "Ko'proq → Profil bo'limiga kiring, rasm ustiga bosing va galereya yoki kameradan rasm tanlang.",
  },
];

export default function Faq() {
  return (
    <Screen>
      <StackHeader title="FAQ" />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-3 p-5 pt-2">
          {FAQ.map((f, i) => (
            <Card key={i} className="gap-1.5">
              <Text variant="h3">{f.q}</Text>
              <Text variant="body">{f.a}</Text>
            </Card>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
