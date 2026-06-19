# Lumio Student App — UI kit

Interactive, high-fidelity recreation of the Lumio language-learning student app, rendered in an iPhone frame. Built from the 8 reference screenshots (recreated, not copied — Lumio's own coral/amber/teal palette).

## Run
Open `index.html`. Loads `../../styles.css` (design tokens), Phosphor icons (CDN), React + Babel, then `kit.jsx` + `screens.jsx`.

## What's interactive
- **Bottom nav** switches the four tabs: **Asosiy** (Home), **Darslar** (Lessons), **Resurslar** (Resources), **Ko‘proq** (More). Active tab = solid coral circle.
- **Asosiy header chat icon →** **Chat**: conversations list → tap a row → message thread (type + send a message). **In a chat thread, tap the peer's name → their Peer profile.** **Bell icon →** **Notifications (Bildirishnomalar)** — grouped list (Bugun/Kecha/Avvalroq) showing unread / read / new (YANGI) / priority (MUHIM) states; tap to mark read, or "Hammasini o‘qildi". Avatar → **Profile (Akkaunt)**; battle-stats card → **Battle result (Jang natijasi)**; leaderboard card → **Leaderboard (Peshqadamlar jadvali)** with level tabs — **tap any ranked student → their Peer profile** (Message / Challenge / add-friend / report-block).
- **Darslar →** tap the active **Unit 1.1** node (or "Ha, qaytish") to open the **lesson quiz**: pick an answer, get correct/wrong feedback, check → continue.
- **Asosiy →** tap "Mening lug‘atim" to open the empty-vocab state.
- **Ko‘proq → Sozlamalar** opens **Settings**: toggle "Ovoz effektlari", tap **Til** for the language bottom-sheet (English / O‘zbekcha).

## Files
- `kit.jsx` — self-contained primitives mirroring the DS components (`Phone`, `StatusBar`, `Btn`, `StatChip`, `FeatureCard`, `LessonNode`, `ListRow`, `BottomNav`, `ScreenTitle`). Inline-styled so the kit renders without the compiled bundle; visuals match `components/`.
- `screens.jsx` — `HomeScreen`, `LessonsScreen`, `ResourcesScreen`, `MoreScreen`, `SettingsScreen`, `QuizScreen`.
- `more-screens.jsx` — `ChatListScreen`, `ChatThreadScreen`, `LeaderboardScreen`, `ProfileScreen`, `BattleResultScreen`, `NotificationsScreen`, `PublicProfileScreen`.
- `peer-profile.html` — standalone demo of `PublicProfileScreen` (the view-another-student flow), shown as its own card in the Design System tab.
- `index.html` — phone frame + tab/overlay state machine.

## Screens covered
Home · Lessons (Duolingo-style path) · Resources · More · Settings (+ language sheet) · Lesson quiz · **Chat list + thread** · **Leaderboard** · **Profile/Akkaunt** · **Battle result**.

## Notes / cut corners
- Single hard-coded lesson question; nav is illustrative, not a real backend.
- Fonts (Baloo 2 / Nunito) and icons (Phosphor) are the documented substitutes — see root `readme.md`.
