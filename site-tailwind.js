/* Shared Tailwind CDN config for the tool pages. Maps the palette names those pages already use
   (gray, green, blue, cyprus, sand, …) onto the light Wise theme, so existing classes follow the theme.
   Roles: sand = Wise Green (buttons, accents), malt = Dark Green (text on green), du-blue = Dark Green (accent text
   on white), cyprus = Near Black (dark feature surfaces), sand-pale = Mint (soft panels). */
(function () {
  const GREEN = '#9fe870', DARK_GREEN = '#163300', MINT = '#e2f6d5', PASTEL = '#cdffad', NEAR_BLACK = '#0e0f0c';
  // Accent families: pale tints for panels, Wise Green for fills and icons, dark greens for text.
  const accent = { 50: '#f3fbee', 100: MINT, 200: PASTEL, 300: MINT, 400: GREEN, 500: GREEN, 600: '#054d28', 700: DARK_GREEN, 800: DARK_GREEN, 900: DARK_GREEN };
  // Warnings use Wise's Warning Yellow; the *-300 tiles stay mint so tile grids read as one family.
  const warn = { 50: '#fff8db', 100: '#fff0b3', 200: '#ffe27a', 300: MINT, 400: '#ffd11a', 500: '#ffd11a', 600: '#6b5200', 700: '#5c4600', 800: '#4d3a00', 900: '#3d2e00' };
  const danger = { 50: '#fdeeee', 100: '#fadada', 200: '#f3b8ba', 300: '#d03238', 400: '#d03238', 500: '#d03238', 600: '#b52a30', 700: '#a3262b', 800: '#841f23', 900: '#6b1a1d' };
  const gray = { 50: '#f6f7f5', 100: '#e8ebe6', 200: '#dcdfd9', 300: '#c9ccc6', 400: '#6a6c69', 500: '#5f615e', 600: '#454745', 700: '#363835', 800: '#222420', 900: NEAR_BLACK };
  window.tailwind = window.tailwind || {};
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          black: NEAR_BLACK,
          malt: DARK_GREEN,
          gray, slate: gray,
          green: accent, blue: accent, emerald: accent, teal: accent, purple: accent, cyan: accent, lime: accent,
          pink: accent, rose: accent, indigo: accent,
          amber: Object.assign({}, warn, { 300: '#ffd11a' }), orange: warn, yellow: warn,
          red: danger,
          cyprus: { DEFAULT: NEAR_BLACK, mid: '#454745', dark: NEAR_BLACK },
          sand: { DEFAULT: GREEN, light: PASTEL, pale: MINT, dark: GREEN },
          'du-dark': NEAR_BLACK, 'du-blue': DARK_GREEN,
          'wise-green': GREEN, 'wise-dark-green': DARK_GREEN, 'wise-mint': MINT, 'wise-black': NEAR_BLACK
        },
        borderRadius: { lg: '10px', xl: '16px', '2xl': '30px', '3xl': '40px' },
        fontFamily: {
          sans: ['Inter', 'Helvetica', 'Arial', 'sans-serif'],
          serif: ['"Wise Sans"', 'Inter', 'Helvetica', 'Arial', 'sans-serif'],
          mono: ['"JetBrains Mono"', 'SFMono-Regular', 'Consolas', 'monospace']
        }
      }
    }
  };
})();
