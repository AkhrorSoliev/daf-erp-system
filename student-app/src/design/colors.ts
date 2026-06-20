import { useColorScheme } from 'nativewind';

/**
 * Neutral colors as hex, for contexts that can't use className (Ionicons color,
 * placeholderTextColor, navigation theme, RefreshControl). Mirrors the semantic
 * CSS vars in src/global.css. Accents (coral/amber/teal…) live in src/design/tokens.ts.
 */
const LIGHT = {
  fg: '#0E2A3D',
  fgBody: '#2B4A5C',
  fgMuted: '#6B8392',
  fgFaint: '#93A6B2',
  bg: '#EDF1F6',
  surface: '#FFFFFF',
  sunk: '#E3E9F1',
  border: '#E0E7EE',
  danger: '#F0513A',
};

const DARK: typeof LIGHT = {
  fg: '#F2F6F9',
  fgBody: '#C7D3DC',
  fgMuted: '#8CA0AD',
  fgFaint: '#6E8492',
  bg: '#08161F',
  surface: '#12303F',
  sunk: '#0B1E29',
  border: '#24465A',
  danger: '#FF7A66',
};

export type ThemeColors = typeof LIGHT;

/** Current-theme neutral colors. Re-renders when the color scheme changes. */
export function useColors(): ThemeColors {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? DARK : LIGHT;
}

export const themeColors = { light: LIGHT, dark: DARK };
