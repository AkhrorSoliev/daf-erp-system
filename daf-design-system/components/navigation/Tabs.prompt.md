Scrollable category tabs (many options) — e.g. the leaderboard's Starter / Beginner / Elementary / Pre-Intermediate. Selected = solid pill.

```jsx
<Tabs onColor value={level} onChange={setLevel}
  items={['Starter','Beginner','Elementary','Pre-Intermediate']} />
```

Use `onColor` when placing over a coral/colored header (white selected pill); omit on light surfaces. For 2–4 fixed options prefer `SegmentedControl`.
