/**
 * DAF Student App — design tokens (token-first).
 * PLACEHOLDER values. When the real design lands, update these tokens (and the
 * src/design/tokens.ts mirror used for non-className contexts) together.
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#ffffff',
        surface: '#f6f7f9',
        fg: { DEFAULT: '#0b0f1a', muted: '#5b6472' },
        primary: { DEFAULT: '#2563eb', fg: '#ffffff' },
        border: '#e5e8ee',
        success: '#16a34a',
        warning: '#d97706',
        danger: '#dc2626',
      },
      borderRadius: {
        button: '12px',
        card: '16px',
      },
    },
  },
  plugins: [],
};
