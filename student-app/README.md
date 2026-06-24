# DaF Student 📱

DaFZentrum til markazi o'quvchilari uchun mobil ilova (Expo SDK 54, managed workflow).
Funksiyalar: Telegram OTP / telefon-parol login, dars jadvali, davomat, to'lovlar, profil, QR davomat skaneri.

- **Paket nomi:** `uz.dafzentrum.student`
- **Backend API:** `https://api.dafzentrum.uz/api` (Railway)
- **EAS project:** owner `dafzentrum` · `7820bfa5-a72c-4f44-913a-58b04a1cf2e8`

## Muhit (environment)

API manzili `EXPO_PUBLIC_API_URL` orqali beriladi:

- **Lokal dev:** `.env` faylida (gitignore'da) — `EXPO_PUBLIC_API_URL=https://api.dafzentrum.uz/api`.
- **EAS build:** `.env` build serveriga yuklanmaydi, shuning uchun URL `eas.json` ning
  `preview` va `production` profillaridagi `env` blokida belgilangan.

## Play Store'ga chiqarish (release)

```bash
# 1. EAS'ga kirish (bir marta)
npm install -g eas-cli
eas login                       # 'dafzentrum' akkaunti

# 2. Production build (.aab) — versionCode EAS'da avtomatik oshadi
eas build --platform android --profile production

# 3. (keyinroq) avtomatik yuborish — service account sozlangach
eas submit --platform android --latest
```

Birinchi marta `.aab` ni Google Play Console'ga **qo'lda** yuklash tavsiya etiladi.
Maxfiylik siyosati: [`privacy-policy.html`](./privacy-policy.html) — hostlab, URL'ini Play Console'ga kiriting.

---

## Get started (Expo)

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
