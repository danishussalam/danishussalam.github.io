/* Shared Tailwind CDN config for the tool pages. Maps the palette names those pages already use
   (gray, green, blue, cyprus, sand, …) onto the dark Malt & Turmeric theme, so existing classes follow the theme.
   Grays are inverted: high numbers are light text, low numbers are dark surfaces. */
(function () {
  const TURMERIC = '#FFBE0B', HOVER = '#FFD04F';
  const accent = { 50: '#3A3019', 100: '#44381C', 200: '#5A4822', 300: '#433722', 400: TURMERIC, 500: TURMERIC, 600: TURMERIC, 700: TURMERIC, 800: HOVER, 900: HOVER };
  const gray = { 50: '#302816', 100: '#352C19', 200: '#3F3520', 300: '#54482E', 400: '#A39A89', 500: '#A39A89', 600: '#BDB3A1', 700: '#CFC6B5', 800: '#E3DACA', 900: '#F3EBDD' };
  window.tailwind = window.tailwind || {};
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          malt: '#2A2312',
          turmeric: { DEFAULT: TURMERIC, hover: HOVER },
          gray, slate: gray,
          green: accent, blue: accent, emerald: accent, teal: accent, purple: accent, orange: accent, yellow: accent,
          amber: accent, pink: accent, rose: accent, indigo: accent, cyan: accent, lime: accent,
          cyprus: { DEFAULT: '#3D3320', mid: '#A39A89', dark: '#231D0F' },
          sand: { DEFAULT: TURMERIC, light: HOVER, pale: '#302816', dark: '#6B5A33' },
          'du-dark': '#2A2312', 'du-blue': TURMERIC,
          'wise-green': TURMERIC, 'wise-dark-green': '#2A2312', 'wise-mint': '#44381C', 'wise-black': '#F3EBDD'
        },
        borderRadius: { lg: '8px', xl: '10px', '2xl': '12px', '3xl': '16px' },
        fontFamily: {
          sans: ['"DM Sans"', '-apple-system', 'BlinkMacSystemFont', 'Helvetica', 'Arial', 'sans-serif'],
          serif: ['Fraunces', 'Georgia', 'serif'],
          mono: ['"JetBrains Mono"', 'SFMono-Regular', 'Consolas', 'monospace']
        }
      }
    }
  };
})();
