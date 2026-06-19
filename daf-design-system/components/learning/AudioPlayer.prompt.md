Listening-exercise audio bar — scrubber with thumb, elapsed/total times, volume, play/pause, and a speed toggle (cycles 1.0x→1.25x→1.5x→0.75x).

```jsx
<AudioPlayer elapsed="00:15" total="00:30" progress={50} playing={isPlaying} onToggle={toggle} />
```

Visual component — wire real audio through `onToggle` and update `progress`/`elapsed`.
