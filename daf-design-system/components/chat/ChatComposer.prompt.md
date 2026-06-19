Bottom message-input bar for a chat thread. Handles its own text state; calls `onSend(text)` on Enter or send-button tap.

```jsx
<ChatComposer onSend={(t) => appendMessage(t)} />
```
