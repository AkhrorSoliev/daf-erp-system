/**
 * Design tokens — TS mirror of the Lumio palette for programmatic (non-className)
 * contexts: navigation theme, StatusBar, ActivityIndicator, placeholderTextColor,
 * chart/legend colors, icon tints. Keep in sync with tailwind.config.js.
 */
export const tokens = {
  color: {
    // semantic
    bg: '#EDF1F6', // app canvas
    sunk: '#E3E9F1',
    surface: '#FFFFFF',
    fg: '#0E2A3D', // ink-900
    fgMuted: '#6B8392', // ink-500
    fgFaint: '#93A6B2', // ink-400
    primary: '#FF6B4A', // coral-500
    primaryPress: '#F04E2C', // coral-600
    primaryFg: '#FFFFFF',
    border: '#E0E7EE',
    success: '#2BB673',
    warning: '#FFB02E',
    danger: '#F0513A',
    // accents
    coral: '#FF6B4A',
    amber: '#FFB02E',
    teal: '#14B8AC',
    grape: '#8B5CF6',
    sky: '#2E97FF',
    white: '#FFFFFF',
  },
  radius: { xs: 8, sm: 12, md: 16, button: 22, card: 22, xl: 28, '2xl': 34, pill: 999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
} as const;

export type Tokens = typeof tokens;
