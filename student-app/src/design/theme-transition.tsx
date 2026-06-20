import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { Dimensions, View } from 'react-native';
import type { SkImage } from '@shopify/react-native-skia';
import { Easing, runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';

// Skia is a native module. Require it defensively so a build WITHOUT it (e.g.
// new JS on an older APK) degrades to an instant switch instead of crashing.
let SkiaLib: typeof import('@shopify/react-native-skia') | null = null;
try {
  SkiaLib = require('@shopify/react-native-skia');
} catch {
  SkiaLib = null;
}

type Ctx = {
  animateThemeChange: (x: number, y: number, apply: () => void, revealColor?: string) => void;
};

const ThemeTransitionContext = createContext<Ctx>({
  animateThemeChange: (_x, _y, apply) => apply(),
});

export const useThemeTransition = () => useContext(ThemeTransitionContext);

/**
 * Telegram-style circular reveal. Snapshots the current UI into an SkImage,
 * flips the theme underneath, then ERASES the snapshot with an expanding circle
 * (blendMode "clear" inside a layer group) so the real new-theme UI is revealed
 * through the hole. Instant fallback without Skia or if the snapshot fails.
 */
export function ThemeTransitionProvider({ children }: { children: ReactNode }) {
  const ref = useRef<View>(null);
  const [overlay, setOverlay] = useState<SkImage | null>(null);
  const r = useSharedValue(0);
  const cx = useSharedValue(0);
  const cy = useSharedValue(0);

  async function animateThemeChange(x: number, y: number, apply: () => void, _revealColor?: string) {
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
      r.value = withTiming(maxR, { duration: 560, easing: Easing.inOut(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setOverlay)(null);
      });
    });
  }

  const { width, height } = Dimensions.get('window');
  const Canvas = SkiaLib?.Canvas as any;
  const Group = SkiaLib?.Group as any;
  const Circle = SkiaLib?.Circle as any;
  const SkiaImage = SkiaLib?.Image as any;
  const canRender = overlay && Canvas && Group && Circle && SkiaImage;

  return (
    <ThemeTransitionContext.Provider value={{ animateThemeChange }}>
      <View ref={ref} collapsable={false} style={{ flex: 1 }}>
        {children}
      </View>
      {canRender ? (
        <Canvas style={{ position: 'absolute', top: 0, left: 0, width, height }} pointerEvents="none">
          <Group layer>
            <SkiaImage image={overlay} x={0} y={0} width={width} height={height} fit="fill" />
            <Circle cx={cx} cy={cy} r={r} blendMode="clear" />
          </Group>
        </Canvas>
      ) : null}
    </ThemeTransitionContext.Provider>
  );
}
