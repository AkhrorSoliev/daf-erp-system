import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { Easing } from 'react-native-reanimated';

/** Lumio motion tokens (mirror daf-design-system/tokens/effects.css). */
export const EASE = Easing.bezier(0.22, 1, 0.36, 1); // --ease-out
export const EASE_BOUNCE = Easing.bezier(0.34, 1.56, 0.64, 1); // --ease-bounce (overshoot)
export const DUR = { fast: 120, base: 200, slow: 320 } as const;

/**
 * Subtle entrance: fade + rise. Pass `index` to stagger a mapped list
 * (Lumio's lumio-fade-up + lumio-stagger). One-shot, forwards.
 */
export function FadeIn({
  children,
  index = 0,
  delay = 0,
  distance = 12,
  duration = DUR.slow,
  style,
}: {
  children: ReactNode;
  index?: number;
  delay?: number;
  distance?: number;
  duration?: number;
  style?: ViewStyle;
}) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: distance }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration, easing: EASE, delay: delay + index * 60 }}
      style={style}
    >
      {children}
    </MotiView>
  );
}
