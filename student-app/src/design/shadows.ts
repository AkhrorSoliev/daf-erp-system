/**
 * Lumio shadow system as React Native `boxShadow` arrays (RN 0.81 / New Arch).
 * Mirrors daf-design-system/tokens/effects.css.
 *
 * Two families:
 *  - ambient: soft, ink-tinted drop shadows for plain white cards.
 *  - clay: the signature "extrude" — a SOLID darker bottom lip (blur 0) plus a
 *    soft colored ambient shadow, so chunky elements look pressed out of clay.
 *    Each has a *Press variant where the lip collapses (element sinks).
 */
import type { BoxShadowValue } from 'react-native';

type Shadow = BoxShadowValue[];

// --- Ambient drop shadows (soft, ink-tinted, never grey-black) ---
export const shadow = {
  xs: [{ offsetX: 0, offsetY: 1, blurRadius: 2, color: 'rgba(14,42,61,0.06)' }] as Shadow,
  sm: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(14,42,61,0.07)' }] as Shadow,
  card: [{ offsetX: 0, offsetY: 10, blurRadius: 24, color: 'rgba(14,42,61,0.09)' }] as Shadow,
  md: [{ offsetX: 0, offsetY: 14, blurRadius: 30, color: 'rgba(14,42,61,0.12)' }] as Shadow,
  pop: [{ offsetX: 0, offsetY: 22, blurRadius: 48, color: 'rgba(14,42,61,0.18)' }] as Shadow,
};

// --- Clay extrude: [solid bottom lip, soft ambient] ---
export const clay = {
  coral: [
    { offsetX: 0, offsetY: 6, blurRadius: 0, color: '#C83D20' },
    { offsetX: 0, offsetY: 16, blurRadius: 26, color: 'rgba(240,78,44,0.30)' },
  ] as Shadow,
  coralPress: [
    { offsetX: 0, offsetY: 2, blurRadius: 0, color: '#C83D20' },
    { offsetX: 0, offsetY: 6, blurRadius: 12, color: 'rgba(240,78,44,0.28)' },
  ] as Shadow,
  teal: [
    { offsetX: 0, offsetY: 6, blurRadius: 0, color: '#0A7A72' },
    { offsetX: 0, offsetY: 16, blurRadius: 26, color: 'rgba(14,154,144,0.30)' },
  ] as Shadow,
  tealPress: [
    { offsetX: 0, offsetY: 2, blurRadius: 0, color: '#0A7A72' },
    { offsetX: 0, offsetY: 6, blurRadius: 12, color: 'rgba(14,154,144,0.28)' },
  ] as Shadow,
  amber: [
    { offsetX: 0, offsetY: 6, blurRadius: 0, color: '#D2790A' },
    { offsetX: 0, offsetY: 16, blurRadius: 26, color: 'rgba(245,149,18,0.30)' },
  ] as Shadow,
  white: [
    { offsetX: 0, offsetY: 5, blurRadius: 0, color: '#E2E8EF' },
    { offsetX: 0, offsetY: 12, blurRadius: 22, color: 'rgba(14,42,61,0.08)' },
  ] as Shadow,
  // Dark-mode twin of `white`: the lip must read darker than the surface,
  // else the light-grey lip glows like a white shadow on a dark screen.
  whiteDark: [
    { offsetX: 0, offsetY: 5, blurRadius: 0, color: '#0A1C26' },
    { offsetX: 0, offsetY: 12, blurRadius: 22, color: 'rgba(0,0,0,0.35)' },
  ] as Shadow,
  whitePress: [
    { offsetX: 0, offsetY: 2, blurRadius: 0, color: '#D6DEE7' },
    { offsetX: 0, offsetY: 5, blurRadius: 10, color: 'rgba(14,42,61,0.10)' },
  ] as Shadow,
  neutral: [
    { offsetX: 0, offsetY: 5, blurRadius: 0, color: '#D6DEE7' },
    { offsetX: 0, offsetY: 12, blurRadius: 22, color: 'rgba(14,42,61,0.10)' },
  ] as Shadow,
};

// --- Inset wells (progress tracks, sunk tiles) ---
export const inset = {
  soft: [{ offsetX: 0, offsetY: 2, blurRadius: 5, color: 'rgba(14,42,61,0.10)', inset: true }] as Shadow,
  deep: [{ offsetX: 0, offsetY: 3, blurRadius: 8, color: 'rgba(14,42,61,0.16)', inset: true }] as Shadow,
};
