import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { Dimensions, View } from 'react-native';
import type { SkImage } from '@shopify/react-native-skia';
import { Easing, runOnJS, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

// Skia is a native module. Require it defensively so a build WITHOUT it (e.g.
// new JS running on an older APK) degrades to an instant theme switch instead of
// crashing the whole app (which would cascade to "No QueryClient set").
let SkiaLib: typeof import('@shopify/react-native-skia') | null = null;
try {
  SkiaLib = require('@shopify/react-native-skia');
} catch {
  SkiaLib = null;
}

type Ctx = { animateThemeChange: (x: number, y: number, apply: () => void) => void };

const ThemeTransitionContext = createContext<Ctx>({
  animateThemeChange: (_x, _y, apply) => apply(),
});

export const useThemeTransition = () => useContext(ThemeTransitionContext);

/**
 * Telegram-style circular reveal for theme switches (when Skia is available).
 * Snapshots the current UI, flips the theme underneath, then wipes the snapshot
 * away with an expanding circle from the toggle point. Falls back to an instant
 * switch when Skia isn't in the binary.
 */
export function ThemeTransitionProvider({ children }: { children: ReactNode }) {
  const ref = useRef<View>(null);
  const [overlay, setOverlay] = useState<SkImage | null>(null);
  const r = useSharedValue(0);
  const cx = useSharedValue(0);
  const cy = useSharedValue(0);

  const clip = useDerivedValue(() => {
    if (!SkiaLib) return null;
    const path = SkiaLib.Skia.Path.Make();
    path.addCircle(cx.value, cy.value, r.value);
    return path;
  });

  async function animateThemeChange(x: number, y: number, apply: () => void) {
    if (!SkiaLib || !ref.current) {
      apply();
      return;
    }
    let snapshot: SkImage | null = null;
    try {
      snapshot = await SkiaLib.makeImageFromView(ref);
    } catch {
      snapshot = null;
    }
    if (!snapshot) {
      apply();
      return;
    }

    const { width, height } = Dimensions.get('window');
    cx.value = x;
    cy.value = y;
    r.value = 0;
    setOverlay(snapshot);
    apply(); // re-theme the live app underneath the frozen snapshot

    const maxR = Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + 2;
    requestAnimationFrame(() => {
      r.value = withTiming(maxR, { duration: 520, easing: Easing.inOut(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setOverlay)(null);
      });
    });
  }

  const { width, height } = Dimensions.get('window');
  const Canvas = SkiaLib?.Canvas as any;
  const Group = SkiaLib?.Group as any;
  const SkiaImage = SkiaLib?.Image as any;

  return (
    <ThemeTransitionContext.Provider value={{ animateThemeChange }}>
      <View ref={ref} collapsable={false} style={{ flex: 1 }}>
        {children}
      </View>
      {overlay && Canvas && Group && SkiaImage ? (
        <Canvas style={{ position: 'absolute', top: 0, left: 0, width, height }} pointerEvents="none">
          <Group clip={clip} invertClip>
            <SkiaImage image={overlay} x={0} y={0} width={width} height={height} fit="cover" />
          </Group>
        </Canvas>
      ) : null}
    </ThemeTransitionContext.Provider>
  );
}
