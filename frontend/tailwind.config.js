/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Палитра завязана на CSS-переменные (см. index.css [data-theme=...]).
        // Значения переменных — raw "R G B" (без rgb()), чтобы работали opacity-модификаторы Tailwind: bg-unifi-ok/15.
        unifi: {
          bg:       'rgb(var(--c-bg) / <alpha-value>)',
          panel:    'rgb(var(--c-panel) / <alpha-value>)',
          panel2:   'rgb(var(--c-panel2) / <alpha-value>)',
          border:   'rgb(var(--c-border) / <alpha-value>)',
          text:     'rgb(var(--c-text) / <alpha-value>)',
          mute:     'rgb(var(--c-mute) / <alpha-value>)',
          accent:   'rgb(var(--c-accent) / <alpha-value>)',
          accent2:  'rgb(var(--c-accent2) / <alpha-value>)',
          ok:       'rgb(var(--c-ok) / <alpha-value>)',
          warn:     'rgb(var(--c-warn) / <alpha-value>)',
          err:      'rgb(var(--c-err) / <alpha-value>)',
        },
        // Алиас mk-* → те же CSS-переменные, что и unifi-*.
        // Нужен для совместимости со старыми компонентами (CLI.tsx, ChatBot, AboutModal, index.css),
        // где ещё используются классы вида text-mk-mute, border-mk-border и т.п.
        mk: {
          bg:       'rgb(var(--c-bg) / <alpha-value>)',
          panel:    'rgb(var(--c-panel) / <alpha-value>)',
          panel2:   'rgb(var(--c-panel2) / <alpha-value>)',
          border:   'rgb(var(--c-border) / <alpha-value>)',
          text:     'rgb(var(--c-text) / <alpha-value>)',
          mute:     'rgb(var(--c-mute) / <alpha-value>)',
          accent:   'rgb(var(--c-accent) / <alpha-value>)',
          accent2:  'rgb(var(--c-accent2) / <alpha-value>)',
          ok:       'rgb(var(--c-ok) / <alpha-value>)',
          warn:     'rgb(var(--c-warn) / <alpha-value>)',
          err:      'rgb(var(--c-err) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
