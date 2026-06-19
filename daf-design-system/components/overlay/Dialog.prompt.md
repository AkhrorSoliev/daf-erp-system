Centered modal over a scrim — confirmations, alerts, and celebration moments. Pops in with the bounce easing; tap the scrim to dismiss.

```jsx
<Dialog variant="alert" icon={<i className="ph-fill ph-heart-break"/>}
  title="Darsni tark etasizmi?" onClose={stay}
  actions={<>
    <Button variant="primary" block onClick={quit}>Ha, chiqish</Button>
    <Button variant="ghost" block onClick={stay}>Davom etish</Button>
  </>}>
  Joriy darsdagi yutuqlaringiz saqlanmaydi.
</Dialog>
```

Variants: `confirm` (coral), `alert` (danger), `celebrate` (amber), `neutral`. Provide buttons via `actions` — stack `<Button block>`s, primary action on top. For action lists / pickers use `BottomSheet` instead. Requires `tokens/motion.css` for the pop-in (shipped via `styles.css`).
