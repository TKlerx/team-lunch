/** @type {import('tailwindcss').Config} */

// Semantic color tokens backed by CSS variables (see src/client/index.css).
// Each token resolves to `rgb(var(--token) / <alpha-value>)` so Tailwind opacity
// modifiers (e.g. `bg-accent-soft/70`) keep working. Light/dark values live in
// one place — the `:root` and `.dark` blocks — so theming a component is just a
// matter of using `bg-surface`, `text-fg`, `border-border`, etc.
const token = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./src/client/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        surface: token('surface'),
        'surface-muted': token('surface-muted'),
        'surface-raised': token('surface-raised'),
        // Foreground / text
        fg: token('fg'),
        'fg-muted': token('fg-muted'),
        // Borders
        border: token('border'),
        // Brand accent
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        'accent-soft': token('accent-soft'),
        'accent-solid': token('accent-solid'),
        'accent-on': token('accent-on'),
        // Status — success / warning / danger
        success: token('success'),
        'success-soft': token('success-soft'),
        'success-fg': token('success-fg'),
        'success-solid': token('success-solid'),
        'success-on': token('success-on'),
        warning: token('warning'),
        'warning-soft': token('warning-soft'),
        'warning-fg': token('warning-fg'),
        'warning-solid': token('warning-solid'),
        'warning-on': token('warning-on'),
        danger: token('danger'),
        'danger-soft': token('danger-soft'),
        'danger-fg': token('danger-fg'),
        'danger-solid': token('danger-solid'),
        'danger-on': token('danger-on'),
      },
    },
  },
  plugins: [],
};
