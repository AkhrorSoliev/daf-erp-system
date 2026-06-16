/**
 * Design tokens — TS mirror of the @theme block in src/global.css.
 * Use for programmatic (non-className) contexts: navigation theme, StatusBar,
 * chart colors, placeholderTextColor, etc.
 *
 * TOKEN-FIRST: when the real design lands, update global.css @theme AND this file
 * together (or generate one from the other). PLACEHOLDER values for now.
 */
export const tokens = {
  color: {
    bg: '#ffffff',
    surface: '#f6f7f9',
    fg: '#0b0f1a',
    fgMuted: '#5b6472',
    primary: '#2563eb',
    primaryFg: '#ffffff',
    border: '#e5e8ee',
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
  },
  radius: { button: 12, card: 16 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
} as const;

export type Tokens = typeof tokens;
