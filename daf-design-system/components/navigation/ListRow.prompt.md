White rounded menu/settings row — soft icon tile + label + trailing chevron (or custom trailing).

```jsx
<ListRow icon={<i className="ph-fill ph-gear"/>} iconTone="grape" label="Sozlamalar" onClick={open} />
<ListRow icon={<i className="ph-fill ph-speaker-high"/>} label="Ovoz effektlari"
  chevron={false} trailing={<Switch checked={on} onChange={setOn} />} />
```
