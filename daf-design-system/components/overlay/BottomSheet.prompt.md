Sheet that slides up from the bottom over a scrim — action menus, pickers, the language selector. Has a grab handle and optional centered title.

```jsx
<BottomSheet title="Til" onClose={close}>
  <SheetAction icon={<i className="ph-fill ph-flag"/>} label="O‘zbekcha" onClick={pickUz} />
  <SheetAction icon={<i className="ph-fill ph-flag"/>} label="English (UK)" onClick={pickEn} />
  <SheetAction icon={<i className="ph-fill ph-prohibit"/>} tone="danger" label="Bloklash" onClick={block} />
</BottomSheet>
```

Use for lists of choices/actions; use `Dialog` for confirmations and alerts. `SheetAction` tones: ink | coral | teal | grape | danger.
