# Lumio Design System

**Lumio** is a playful, gamified **student app for learning languages** (English ⇄ Uzbek to start), built for **iOS and Android**, with a **web version planned**. It turns study into a game: a Duolingo-style lesson path, XP/streak/coin rewards, flashcard vocabulary, live Zoom events, leaderboards, books, and podcasts.

This design system captures Lumio's look and feel so any agent can build on-brand screens, slides, and prototypes.

> **Provenance / sources.** This system was derived from **8 reference screenshots** of a similar Uzbek English-learning app (`uploads/1.jpg`–`uploads/8.jpg`) — the *Darslar* (lessons path), *Asosiy* (home), *Resurslar* (resources), *Ko'proq* (more), and *Sozlamalar* (settings) screens. No codebase or Figma was provided. Per the brief, Lumio **keeps the reference vibe** (chunky clay cards, bold rounded type, gamification, gradient feature tiles) **but deliberately uses a different palette** — the reference's cyan-primary + deep-purple was replaced with **coral + amber + teal on deep-ocean ink**.

---

## Brand in one line
Friendly, energetic, confidence-building. Big rounded type, soft clay surfaces, warm coral energy, and constant little rewards. It should feel like a game you *want* to come back to, not a textbook.

---

## CONTENT FUNDAMENTALS — how Lumio writes

The reference UI is **Uzbek-language**, and Lumio keeps Uzbek (Latin script) as the primary product language, with English as a learning target.

- **Voice:** warm, encouraging, peer-level — like a friendly tutor, never a stern teacher. Celebrates effort.
- **Address:** speaks **to "you" (siz / sizning)** — second person, polite-but-friendly. Asks questions: *"Siz Starter darslariga qaytmoqchimisiz?"* ("Want to go back to the Starter lessons?").
- **Casing:** **Sentence case** for body and prompts. Screen titles and section headers are short single words / noun phrases in **Title case or sentence case** (*"Darslar", "Resurslar", "Beginner 1", "Mening lug'atim"*). No ALL-CAPS shouting; small UPPERCASE only for micro-labels/eyebrows.
- **Length:** ultra-short. Buttons are 1–3 words (*"Ha, qaytish", "Davom etish"*). Empty states are a single friendly line (*"Hali so'zlar yo'q"* — "No words yet").
- **Numbers are loud and proud:** progress %, XP (201), coins (0), unit numbers (Unit 1.1) are set in the chunky display face — gamification is front-and-center.
- **Uzbek typography note:** use the correct **ʻ (oʻzbek tutuq belgisi)** in *oʻ / gʻ* (e.g. *"Ko'proq", "lug'at", "yo'q"*).
- **Emoji:** **not** used as UI. Personality comes from icons, color, sparkles, and motion instead.
- **Tone examples (Uzbek → gloss):**
  - Greeting: *"Salom, jack!"* — "Hi, jack!" (lowercase username as entered)
  - Prompt: *"Sizning darsingiz shu yerda"* — "Your lesson is here"
  - Empty: *"Hali so'zlar yo'q"* — "No words yet"
  - Settings rows: *Ovoz effektlari, Mavzu, Til, Hisobni boshqarish* (Sound effects, Theme, Language, Manage account)
- **English learning content** (flashcards, examples) is plain and concrete: *"A teacher inspires students."*

---

## VISUAL FOUNDATIONS

**Overall feel:** "soft clay arcade." Everything is rounded, chunky, and tactile, with a bright warm accent system on cool-soft neutrals.

### Color
- **Primary — Coral `#FF6B4A`** (`--coral-500`): brand, primary buttons, the active bottom-nav circle, active lesson glow. Press = `--coral-600`.
- **Amber `#FFB02E`**: XP / energy / coins / streak, warm feature tiles, the "achievement" feel.
- **Teal `#14B8AC`**: success, secondary pops, progress accents, "correct" answers.
- **Grape `#8B5CF6`** & **Sky `#2E97FF`**: utility/menu icon tiles and cool gradient feature cards (variety, like the reference's varied gradient tiles).
- **Ink `#0E2A3D`** (`--ink-900`): all headings & primary text — a deep ocean-ink that replaces the reference's deep purple. Body `--ink-700`, muted `--ink-500`.
- **Surfaces:** white cards on a cool-soft `--bg-app #EDF1F6` canvas; sunken wells use `--bg-sunk`.
- **Imagery vibe:** bright, saturated, warm-leaning; rounded 3D/claymorphic objects and soft pastel cloud/sparkle decor. Not photographic/grainy — clean and toy-like.

### Type
- **Display — Baloo 2** (ExtraBold/Bold): chunky, rounded headings, screen titles, and **all big numbers**. This is the personality face.
- **UI/Body — Nunito** (SemiBold/Bold/ExtraBold): everything readable — paragraphs, labels, list rows, nav.
- Headings are tight (`-0.01em`), heavy (800), short. Body is 16/1.5, 600 weight (slightly bolder than typical — keeps the friendly density).
- *(Substitution: the reference used a proprietary rounded sans; Baloo 2 + Nunito are the closest free Google Fonts matches — see Caveats.)*

### Shape, depth & the "clay" system
- **Corner radii are large:** cards `22px`, feature tiles `28–34px`, buttons `16–28px`, chips/pills fully round. Nothing is sharp.
- **Clay extrude** is the signature: chunky elements (buttons, lesson nodes, feature tiles) have a **solid darker bottom lip** (`0 6px 0 <darker>`) **plus** a soft colored ambient shadow — they look pressed out of clay.
- **Ambient cards:** plain white cards use a soft ink-tinted drop shadow (`--shadow-card`) + 1px hairline.
- **Inset wells:** progress tracks, segmented controls, and sunk tiles use inner shadow (`--inset-soft/-deep`).
- **Glass:** the bottom nav and bottom sheets use translucent white + backdrop blur.

### Motion & states
- **Easing:** playful. `--ease-out` for most, `--ease-bounce` (overshoot) for toggles, knobs, and reward pops.
- **Press state:** chunky elements **sink** — the bottom lip collapses and the element translates down ~3–4px (not just opacity). Tap targets scale to ~0.92–0.96.
- **Hover (web):** ghost buttons fill with `--ink-100`; rows tint to `--bg-tint`; primary buttons lighten slightly. No dramatic color inversions.
- **Decoration:** soft blue/pastel **clouds** and **yellow sparkles** scattered on the lesson map; dashed connector paths between units. Keep decoration sparse and behind content.
- **Reduced motion:** entrances must resolve to the visible state (never leave content hidden).

### Motion system (`tokens/motion.css`)
Animation is **tiered by frequency — the more often a moment fires, the subtler it is.** Tokens (`--ease-*`, `--dur-*`) live in `effects.css`; the shared `@keyframes` + utility classes live in `motion.css` (shipped via `styles.css`).

| Tier | When | Keyframes / classes | Feel |
|---|---|---|---|
| **Subtle** | constant — card/row enter, tab change, answer select | `lumio-fade-up`, `lumio-pop-in`, `lumio-slide-in`, `lumio-stagger` (set `--i`) | 120–320ms, quick & quiet |
| **Medium** | daily — lesson done, streak tick, wrong answer | `lumio-bounce-in`, `lumio-shake`, `lumio-pulse-ring` | one bouncy beat |
| **Big** | rare — battle win, level-up, milestone | `lumio-confetti`, `lumio-burst` | confetti / trophy moment |
| **Loop accents** | ambient, small only | `lumio-sparkle`, `lumio-float` | lesson-map sparkles, gentle bob |

- **One-shot rule:** entrance/celebration anims run **once, forwards** (`both`). Looping is reserved for small decorative accents (sparkle, float, the active node's `pulse-ring`) — never on body content.
- **In the kit:** the battle-win winner card uses `bounce-in` + animated `confetti`; the notifications list **staggers** in; a wrong quiz answer **shakes**.
- **Reduced motion:** `motion.css` includes a global `prefers-reduced-motion: reduce` block that collapses all animation/transition durations to ~0 and forces a single iteration — content lands on its end-state, loops stop. Honor it; never gate visibility solely on an animation.
- See the **Motion** card in the Design System tab (`guidelines/motion.html`) for live specimens of each easing + keyframe.

### Sound
Lumio has a real **sound layer** behind the Settings “Ovoz effektlari” toggle: a tiny **procedural Web Audio engine** (`assets/sound.js`) that synthesizes short, playful cues live — **no audio asset files**, works offline, and stays tonally consistent (bright triangle/square blips in a C-major-ish set).

- **Load + call:** `<script src="…/assets/sound.js">` then `LumioSound.play('correct')`. API: `play(name)`, `enabled()`, `setEnabled(bool)` (wire to the Settings switch), `unlock()` (call on first user tap to satisfy autoplay policies), `cues` (names).
- **Gating:** every `play()` is a no-op when the setting is off; the flag lives in `localStorage` (`lumio.sound.enabled`, default on) so the Settings toggle controls sound app-wide.
- **Cue palette (when each fires):** `tap` (light press) · `select` (nav / tab change) · `toggle` (switches) · `correct` / `wrong` (answers) · `coin` / `xp` / `streak` (rewards) · `levelup` / `win` (milestones, battle result) · `notify` / `message` (incoming / sent) · `sheet` (overlay open) · `locked` (blocked action).
- **Rules of use:** sound mirrors the **motion tiers** — frequent events get the tiny `tap`/`select`; rare wins get `win`/`levelup`. One cue per event (never on every render or in loops); keep volumes low; always pair celebratory sound with its visual (confetti, pop) rather than firing alone. Honor the toggle and treat audio as enhancement, never the sole signal (accessibility).
- **Demo:** the **Sound Effects** card (`guidelines/sound.html`) is a live soundboard; the **Sound System (reference)** card (`guidelines/sound-system.html`) lists every cue individually with a play-preview, duration, volume, trigger event, and usage guidelines. In the kit, nav, quiz answers, sent messages, the battle-win screen, and the sound toggle are all wired.

### Overlays — Dialog & BottomSheet
Two overlay patterns, both over a `rgba(14,42,61,.48)` scrim, both built on `motion.css`:
- **`Dialog`** (`components/overlay/`) — a **centered modal** that **pops in** (`lumio-pop-in`, bounce). For confirmations, alerts, and celebrations. An icon **medallion** sets the tone by variant: **confirm** (coral), **alert** (danger), **celebrate** (amber), **neutral**. Buttons stack vertically via `actions` — primary on top, a `ghost`/`secondary` cancel below. Tapping the scrim dismisses (`dismissOnScrim`).
- **`BottomSheet`** + **`SheetAction`** (`components/overlay/`) — a sheet that **slides up** from the bottom (grab handle + optional centered title). For **action lists and pickers** (the language selector, peer report/block actions). `SheetAction` rows take an icon, label, and `tone` (incl. `danger` for destructive).
- **Which to use:** Dialog = a decision or a moment (“Are you sure?”, “You won!”); BottomSheet = a list of choices/actions. Both honor reduced-motion (pop/slide collapse to the end-state).
- **In the kit:** closing a lesson (× in the quiz) raises an **alert Dialog** (“Darsni tark etasizmi?”); Settings → **Til** and the peer-profile ⋮ menu use the sheet/menu pattern. Live demos: the **Overlay** component card.

### Layout rules
- Mobile-first, single column, generous `20px` side gutters and `16px` between stacked cards.
- **Fixed elements:** a floating glass **BottomNav** pill (4 tabs; active = solid coral circle) sits above the safe area; screen titles sit top-left in the display face.
- Min touch target **48px**. Web shell caps content at `--content-max 1120px`, centered.

### Responsive & tablet
Lumio is **mobile-first**: base styles target phones, and `min-width` breakpoints progressively widen the layout. Breakpoints (tokens in `tokens/spacing.css`, helper classes in `tokens/responsive.css`, both shipped via `styles.css`):

| Token | Width | What changes |
|---|---|---|
| `--bp-sm` | 480px | large phone — type/imagery may scale up slightly |
| `--bp-tablet` | **768px** | **tablet portrait** — bottom nav → **side rail**; gutters 20→40px; grids go **2-col**; dialogs cap width |
| `--bp-lg` | **1024px** | tablet landscape / small desktop — rail can **expand** (label + icon); grids **3-col**; **two-pane** master/detail |
| `--bp-xl` | 1280px | desktop — content centers and caps at `--content-max` (1120px) |

How each system adapts:
- **Navigation.** The floating **BottomNav** is phone-only (`.lumio-bottom-nav`, hidden ≥768). On tablet a vertical **side rail** (`.lumio-side-rail`, `--rail-w 96px`) takes over; ≥1024 it can expand to `--rail-w-open 240px` with text labels. Same destinations, same active-coral treatment — just reoriented.
- **Grids.** Stacked cards become columns: `.lumio-grid` = 1→2→3 cols at the breakpoints, or `.lumio-grid--auto` fills as many `--col-min (300px)` columns as fit with no breakpoints. `--grid-gap` widens to 24px on tablet.
- **Page layout.** `.lumio-container` applies responsive gutters (20→40px) and caps width (`--kit-max 960px`, then `--content-max 1120px`), centered. Reading-width content (forms, chat threads) stays in a `--reading-max 620px` column instead of stretching edge-to-edge. `.lumio-two-pane` turns a single scroll into a master/detail (e.g. Home content + leaderboard rail, or lesson list + lesson view) at ≥768.
- **Dialogs & sheets.** `Dialog` already caps at `max-width:360` and centers, so it reads as a modal card (not full-bleed) on tablet automatically. **BottomSheet** stays bottom-anchored on phones; on tablet prefer a centered `Dialog` or anchored popover for the same action lists (a full-width sheet on a wide screen feels stranded).
- **Spacing & type.** Gutters and card gaps step up via the tablet tokens; display type can scale up one step on `--bp-lg`. Touch targets stay **≥48px** at every size.
- **Visibility helpers.** `.lumio-mobile-only` and `.lumio-tablet-up` show/hide chrome per tier (e.g. hide the bottom nav, reveal a topbar).

Components stay **fluid by default** (they fill their container), so most adaptation is the *parent layout's* job — swap the grid/container/nav class at the breakpoint and the inline-styled components reflow. See the **Tablet Layout** screen (`ui_kits/student-app/tablet.html`) for the side-rail + two-pane pattern, and the **Breakpoints & Responsive** foundation card.

---

## ICONOGRAPHY

- **Library: [Phosphor Icons](https://phosphoricons.com/)** (loaded from CDN). Chosen because it offers **regular / bold / fill** weights with friendly rounded terminals that match the reference's soft, slightly chunky duotone glyphs.
  - **Inactive** nav / decorative icons → `ph` (regular) or `ph-bold`.
  - **Active** / emphasis icons (active tab, stat chips, list-row tiles) → `ph-fill`.
  - Usage: `<i class="ph-fill ph-house"></i>`. Sizes 20–24px in UI, larger as feature-card art.
  - *(Substitution: the reference's exact icon set is unknown/proprietary; Phosphor is the closest free match — see Caveats.)*
- **Common glyphs:** `house` (Asosiy), `path` (Darslar), `books`/`book-open` (Resurslar), `squares-four` (Ko'proq), `lightning` (XP), `coin`, `fire` (streak), `diamond` (gems), `lock-simple`, `arrow-up-right` (open), `caret-right`, `gear`, `translate`, `speaker-high`, `cards-three` (vocab), `video-camera` (Zoom), `trophy` (leaderboard).
- **Brand mark:** `assets/lumio-mark.svg` — a coral squircle with a white energy bolt + amber spark (echoes the XP-lightning motif). This is the one custom SVG; all other icons come from Phosphor.
- **Emoji / unicode:** not used as iconography (the Uzbek tutuq belgisi `ʻ` is the only special character in routine copy). Emoji *do* appear naturally inside **chat messages** — that's user content, not UI chrome.
- **Chat / social glyphs:** `chat-circle` / `chat-circle-dots` (messages), `paper-plane-right` (send), `paperclip` (attach), `phone` (call), `magnifying-glass` (search), `medal` / `crown-simple` (achievements), `plant` (level/growth), `clock` (battle time), `check` / `x` (battle correct/wrong).

### Hosting
Icons currently load from the **unpkg CDN** (three stylesheets — one per weight) in every card, UI-kit page, and consumer:
```html
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css">
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/bold/style.css">
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css">
```
- **Why CDN now:** zero-setup, always current, fine for prototypes/mocks and the Design System tab.
- **Trade-offs:** needs a network connection, pins a third-party host, and isn't version-locked into the system bundle.
- **For production / offline → self-host.** Drop the Phosphor `.woff2` + `style.css` files into `assets/icons/`, then `@import` them through the token closure (e.g. a `tokens/icons.css` `@import`ed from `styles.css`) so the icon font ships *with* the design system and consumers get it from the one `styles.css` link — no external dependency. (Not yet done — flag this when moving to production.)
- The icon **weight = state** contract and glyph names are identical either way; only the source URLs change.

---

## SOCIAL — battle, leaderboard, profile & chat

Lumio is competitive and social. Four patterns extend the core gamification:

- **Battle (Jang)** — 1-v-1 timed quiz duels. A **matchmaking lobby** ("Jangni kutish") lists the two players; the **result** ("Jang natijasi") shows a confetti **winner card** (warm gradient) with four `ResultStatPill`s — correct (green), wrong (red), star (amber), time (sky) — then the runner-up in a soft card, then a **green answer-review** list where the user's chosen words are solid-green chips inline in each sentence.
- **Leaderboard (Peshqadamlar jadvali)** — a coral header with the user's summary (avatar, level badge, star total), scrollable level **Tabs** (Starter / Beginner / Elementary / Pre-Intermediate), the signed-in user's own **highlighted (coral-outlined) row** pinned on top, then ranked `LeaderboardRow`s (top-3 ranks in coral, star-XP pill trailing).
- **Profile (Akkaunt)** — coral header (back, star total, avatar, name, chat shortcut), a gradient **level banner** with a sprout/`plant` motif, a **Jang statistikasi** card (Janglar / Yutuqlar / Mag‘lubiyat), a **certificates** card, and a **medals** row (chunky rounded clay tiles).
- **Peer profile (boshqa o‘quvchi)** — what a student sees when viewing *another* student (tap a **leaderboard row** or a **chat header**). Same coral-header language as the own-profile, but **social-first instead of settings**: a big avatar + online dot, level / star-XP / global-rank badges, an **action row** (**Xabar** → opens a chat thread, **Jangga chaqirish** → starts a battle, **add-friend** toggle → user-plus→user-check), a **“Sizga qarshi” head-to-head** record vs the viewer, a **friends count** (+ mutual), and **medals**. A header **⋮ menu** exposes the student-safety actions **Shikoyat qilish** (report) and **Bloklash** (block). No edit/settings affordances — those are owner-only on the Akkaunt screen.
- **Chat (Suhbatlar)** — student-to-student messaging. A **conversations list** (`ConversationRow`: avatar + online dot, name, last-message preview, time, unread coral badge) opens a **thread**: a sticky chat header (avatar, online status, call), date divider, `MessageBubble`s (coral right for *me*, white left for *them*; sender name shown on incoming **group** messages), and a pinned `ChatComposer` (rounded field + attach + coral send).

**Chat tone:** casual and peer-level, short turns, emoji welcome (💪 👍). Keep moderation/safety in mind for a student audience — reporting/blocking affordances belong on the thread header in production.

---

## LEARNING CONTENT

The core study loop has its own component family (`components/learning/` + additions in `components/gamification/`), derived from the vocabulary, video, and homework reference screens. Lumio keeps its own palette here (ink headings, coral primary) — the source screens' purple-heading + blue-button styling is **not** reproduced.

- **Vocabulary hub (Mening lug‘atim)** — three **`CategoryCard`**s (O‘rganilayotgan / Yangi / Barcha so‘zlar — soft sky / pink / sand) over a **`ProgressChart`**: range tabs (7 kun / 1 oy / 6 oy / 1 yil), an SVG line chart with a dashed grid, and a colored legend.
- **Empty state (Sizda hali so‘zlar yo‘q)** — **`NumberedSteps`**: chunky clay numbered tiles alternating left/right, joined by dashed connectors, each with an explanatory bubble. The pattern for any “how it works” intro.
- **Unit detail (Unit 1.1)** — `CategoryCard`s for the unit sections (Video / Vocabulary / Homework) carrying a **% value** instead of a count.
- **Video lessons** — **`VideoLessonCard`**: a Video row + a Mashq (practice) row, each with **`FractionChip`** star/coin progress (e.g. `0/10`) over an inset track, plus a watch CTA.
- **Vocabulary flashcard (Mavzuga qaytish)** — **`WordCard`**: flag + part-of-speech, the term with an audio button, IPA, and an italic example with a translate toggle. Stack an EN card over a UZ-translation card.
- **Homework / practice** — **`ExerciseCard`**: a green **type** pill (Choose Answer / Construct) + an amber **skill** pill (LISTENING / GRAMMAR), the instruction, star/coin fractions, and an amber progress bar.
- **Listening / fill-in-the-blank** — **`AudioPlayer`** (scrubber, times, volume, play/pause, speed toggle) above a sentence with tappable blank slots; answer options sit in a bottom sheet.
- **`FractionChip`** (earned/total stars & coins) and **`CategoryCard`** live in `components/gamification/` since they're reused beyond lessons.

In the kit, this is a full flow: **Lessons → Unit 1.1 → Video / Vocabulary / Homework → flashcard / exercise / fill-in-the-blank**, and **Home → Mening lug‘atim → empty-state steps**.

---

## NOTIFICATIONS

Notifications use the **`NotificationItem`** component (`components/feedback/`) and a date-grouped list (the **Bildirishnomalar** screen, reached from the Home **bell**). The bell carries an unread-count badge; tapping an item marks it read, and a **"Hammasini o‘qildi"** (mark-all-read) action sits in the header.

**State matrix** (all covered by one component via props):
- **Unread** — faint **coral-tinted** surface (`--coral-50`), `--coral-100` border, **bold** title, soft shadow, and a **coral dot** on the trailing edge.
- **Read** — **flat/transparent** surface, hairline border, **muted** title (`--ink-600`) and body, no shadow, no dot.
- **Newly received** (`isNew`) — an unread item plus a coral **"YANGI"** pill next to the title (drop it once seen).
- **High-priority** (`priority`) — **amber** left **accent bar** + amber-tinted surface + a **"MUHIM"** pill with a warning glyph; the trailing dot turns amber. Priority wins over the normal unread styling.
- **Type** sets the icon-tile color: `achievement` (amber/trophy), `battle` (coral/sword), `social` (grape/chat), `lesson` (teal/book), `system` (ink/warning).

**Grouping & badges** — items are bucketed under uppercase date headers (**Bugun / Kecha / Avvalroq**); each header shows a coral **count badge** of its unread items. The same coral count-pill is reused on the Home bell and as `unread` counts on `ConversationRow`, so "badge" styling is consistent everywhere. For OS-level push, mirror the bell count as the app-icon badge.

---

## Foundations at a glance (tokens)
Consumers link **one file**: `styles.css` (it `@import`s the token + font closure).
- `tokens/colors.css` — coral/amber/teal/grape/sky ramps, ink/neutrals, semantic aliases, gradients.
- `tokens/typography.css` — Baloo 2 / Nunito families, scale, weights.
- `tokens/spacing.css` — 8pt-based spacing, layout, touch sizes.
- `tokens/effects.css` — radii, the clay-extrude shadow set, insets, glass, motion (easings + durations).
- `tokens/motion.css` — shared `@keyframes` + utility classes (tiered entrance/celebration anims) + the reduced-motion block.
- `tokens/responsive.css` — breakpoint-driven helper classes (container, grids, two-pane, side rail, visibility) — the responsive behavior inline styles can't express.
- `assets/sound.js` — procedural Web Audio cue engine (`LumioSound.play(name)`) behind the “Ovoz effektlari” setting.
- `tokens/fonts.css` — Google Fonts `@import` for Baloo 2 + Nunito.

---

## INDEX — what's in this project

**Root**
- `styles.css` — global entry (imports only).
- `readme.md` — this guide.
- `SKILL.md` — portable Agent-Skill manifest.
- `tokens/` — colors, typography, spacing, effects, fonts.
- `assets/` — `lumio-mark.svg` (brand mark).

**Components** (`window.LumioDesignSystem_f2f824.<Name>` after the bundle loads)
- `components/core/` — **Button, IconButton, Card, Badge, Chip, Avatar**
- `components/forms/` — **Input, Switch, SegmentedControl**
- `components/feedback/` — **ProgressRing, ProgressBar, NotificationItem**
- `components/overlay/` — **Dialog, BottomSheet, SheetAction**
- `components/learning/` — **WordCard, AudioPlayer, VideoLessonCard, ExerciseCard, NumberedSteps, ProgressChart**
- `components/gamification/` — **StatChip, FractionChip, CategoryCard, FeatureCard, LessonNode, ResultStatPill, LeaderboardRow**
- `components/navigation/` — **BottomNav, ListRow, Tabs**
- `components/chat/` — **MessageBubble, ChatComposer, ConversationRow**

**Foundation cards** (`guidelines/`) — color, type, spacing, radii, clay/shadow specimens (Design System tab).

**UI kit** (`ui_kits/student-app/`) — interactive Lumio app in a phone frame: Home, Lessons path, Resources, More, Lesson/quiz, **Chat (conversations + thread), Leaderboard, Profile/Akkaunt, Battle result (Jang natijasi), and Notifications (Bildirishnomalar)**. See its `README.md`.

---

## CAVEATS
- **Fonts are substitutes.** Baloo 2 + Nunito are the closest free Google Fonts to the reference's proprietary rounded sans. Swap real binaries into `tokens/fonts.css` if/when licensed.
- **Icons are substitutes.** Phosphor approximates the reference's icon set, and currently loads from CDN — **self-host the font files for production/offline** (see Iconography → Hosting).
- **Palette is intentionally new** (coral/amber/teal), per the brief — not a copy of the reference's cyan/purple.
- No codebase/Figma was available, so screens are recreated from screenshots and may differ from production specifics.
