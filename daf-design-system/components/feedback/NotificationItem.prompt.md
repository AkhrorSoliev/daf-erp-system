Notification row covering the full state matrix — unread (coral tint + dot + bold), read (flat + muted), newly received ("YANGI" pill), and high-priority ("MUHIM" amber accent bar + pill). `type` sets the icon-tile color.

```jsx
<NotificationItem type="battle" icon={<i className="ph-fill ph-sword"/>}
  title="Asror sizni Jangga chaqirdi" body="Beginner 1 · 10 savol" time="Hozir" isNew />
<NotificationItem type="achievement" icon={<i className="ph-fill ph-trophy"/>}
  title="5 kunlik seriya!" body="+50 XP" time="2 soat oldin" />
<NotificationItem type="system" icon={<i className="ph-fill ph-warning"/>}
  title="Obuna tugaydi" body="Obunangiz 2 kundan keyin tugaydi" time="Kecha" priority />
<NotificationItem type="lesson" icon={<i className="ph-fill ph-book-open"/>}
  title="Bugungi dars tayyor" read time="Du" />
```

Group items under date headers (Bugun / Kecha / Avvalroq); pair with the bell's unread-count `Badge` for the badge count.
