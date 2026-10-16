/** @type {import('tailwindcss').Config} */
// Colours are CSS variables (see src/index.css) so the Appearance menu can switch themes without a rebuild.
// Palette idea: the steel tijori (almirah locker) found in Indian homes. Deep almirah green, brass hardware,
// sindoor red for danger, and a cool steel-white page. Few colours, each with one job.
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: c('ink'), // text
        paper: c('paper'), // page, a steel white with a green breath
        line: c('line'),
        muted: c('muted'),
        seal: { DEFAULT: c('seal'), dark: c('seal-dark'), tint: c('seal-tint'), glow: c('seal-glow') }, // primary: safe, done
        brass: { DEFAULT: c('brass'), bright: c('brass-bright'), tint: c('brass-tint') }, // hardware: highlights, attention
        sindoor: { DEFAULT: c('sindoor'), tint: c('sindoor-tint') }, // danger and errors only
        vault: { DEFAULT: c('vault'), deep: c('vault-deep'), rim: c('vault-rim') }, // the dark door
      },
      fontFamily: {
        sans: ['Mukta', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Mukta', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
