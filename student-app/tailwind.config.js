/**
 * DAF Student App — Lumio design tokens.
 * Mirrors daf-design-system/tokens/*.css (colors, type, radii). Programmatic
 * (non-className) values live in src/design/tokens.ts; clay/ambient shadows in
 * src/design/shadows.ts. Keep all three in sync.
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // --- Lumio palettes (full ramps) ---
        coral: {
          50: '#FFF2EE', 100: '#FFE1D8', 200: '#FFC6B5', 300: '#FFA48A',
          400: '#FF855F', 500: '#FF6B4A', 600: '#F04E2C', 700: '#C83D20',
        },
        amber: {
          50: '#FFF6E6', 100: '#FFE9BF', 300: '#FFD27A', 400: '#FFC24D',
          500: '#FFB02E', 600: '#F59512', 700: '#D2790A',
        },
        teal: {
          50: '#E6FBF8', 100: '#C2F4ED', 300: '#6FE0D3', 400: '#2DD4C4',
          500: '#14B8AC', 600: '#0E9A90', 700: '#0A7A72',
        },
        grape: { 100: '#ECE6FE', 300: '#C4B2FB', 400: '#A78BFA', 500: '#8B5CF6', 600: '#7C3AED' },
        sky: { 100: '#DCEEFF', 300: '#8FCBFF', 400: '#5BB1FF', 500: '#2E97FF', 600: '#1B7BE0' },
        ink: {
          100: '#EAF0F4', 200: '#DCE4EA', 300: '#BCCAD3', 400: '#93A6B2',
          500: '#6B8392', 600: '#45616F', 700: '#2B4A5C', 800: '#1B3A4E', 900: '#0E2A3D',
        },

        // --- Semantic aliases (also keep the names existing screens use) ---
        bg: '#EDF1F6', // app canvas
        sunk: '#E3E9F1', // sunken wells / tracks
        tint: '#F5F8FB', // faint card tint
        surface: '#FFFFFF', // cards are white now
        fg: { DEFAULT: '#0E2A3D', muted: '#6B8392' },
        primary: { DEFAULT: '#FF6B4A', fg: '#FFFFFF' },
        border: '#E0E7EE',
        line: '#E0E7EE',
        'line-strong': '#CFD9E2',

        success: { DEFAULT: '#2BB673', 50: '#E4F7EE', 600: '#1F9E61' },
        warning: { DEFAULT: '#FFB02E' },
        danger: { DEFAULT: '#F0513A', 50: '#FDE9E5', 600: '#D63A24' },
      },
      borderRadius: {
        xs: '8px', sm: '12px', md: '16px', lg: '22px', xl: '28px',
        '2xl': '34px', '3xl': '40px',
        button: '22px', // Lumio md button
        card: '22px', // Lumio default card
        pill: '999px',
      },
      fontFamily: {
        // Display = Baloo 2 (chunky rounded headings + numbers)
        displayx: ['Baloo2_800ExtraBold'],
        display: ['Baloo2_700Bold'],
        displaymd: ['Baloo2_600SemiBold'],
        // UI/Body = Nunito
        bodyreg: ['Nunito_400Regular'],
        body: ['Nunito_600SemiBold'],
        bodymd: ['Nunito_700Bold'],
        bodyx: ['Nunito_800ExtraBold'],
        bodyblack: ['Nunito_900Black'],
      },
    },
  },
  plugins: [],
};
