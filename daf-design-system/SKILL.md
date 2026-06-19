---
name: lumio-design
description: Use this skill to generate well-branded interfaces and assets for Lumio, the gamified language-learning student app (iOS / Android / web), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI-kit components for prototyping.
user-invocable: true
---

# Lumio Design

Read `readme.md` in this skill first — it holds the brand context, content fundamentals, visual foundations, and iconography rules. Then explore the other files:

- `styles.css` + `tokens/` — design tokens (coral/amber/teal palette, Baloo 2 + Nunito type, clay-shadow system, motion, responsive breakpoints + helper classes). Link `styles.css` and use the CSS custom properties. Mobile-first; tablet adapts at 768/1024 (side rail, multi-column grids, two-pane) — see the readme's "Responsive & tablet" section.
- `components/` — React primitives (Button, Card, Badge, Chip, Avatar, Input, Switch, SegmentedControl, ProgressRing/Bar, NotificationItem, Dialog, BottomSheet, StatChip, FractionChip, CategoryCard, FeatureCard, LessonNode, ResultStatPill, LeaderboardRow, BottomNav, ListRow, Tabs, learning (WordCard, AudioPlayer, VideoLessonCard, ExerciseCard, NumberedSteps, ProgressChart), and chat (MessageBubble, ChatComposer, ConversationRow)). Each has a `.prompt.md` with usage.
- `ui_kits/student-app/` — full interactive app recreation (Home, Lessons path, Resources, More, Quiz, Settings, Chat, Leaderboard, Profile, Battle result, Notifications, Vocabulary, Unit detail, Video, Flashcard, Homework, Fill-in-the-blank) you can copy from.
- `guidelines/` — foundation specimen cards.
- `assets/` — `lumio-mark.svg` brand mark. Icons come from Phosphor (CDN). `sound.js` — procedural Web Audio sound-effect engine (`LumioSound.play('correct')`), gated by the Ovoz effektlari setting.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and produce static HTML files for the user to view. For production work, copy assets and apply the rules here to design natively on-brand.

If the user invokes this skill without other guidance, ask them what they want to build, ask a few clarifying questions, and act as an expert designer who outputs HTML artifacts *or* production code as needed.

**Brand essence:** playful, gamified, encouraging. Chunky rounded clay surfaces, bold rounded display type, warm coral energy, constant little rewards (XP/streak/coins). Uzbek-first copy, second-person and friendly, no emoji in UI.
