/**
 * Design Tokens — Single source of truth for branding.
 *
 * Change colours, fonts, logos and accent tones here;
 * the CSS-variable layer (variables.css) and every component
 * will pick up the new values automatically.
 *
 * Structure
 * ─────────
 *  • colors.brand       – primary / secondary / accent
 *  • colors.dark.*      – dark-mode semantic colours
 *  • colors.light.*     – light-mode semantic colours
 *  • fonts              – family stacks & base sizes
 *  • logo               – SVG viewBox path(s) reused in header/footer
 *  • difficulty         – per-difficulty colour pairs (dark & light)
 */

const tokens = {
  /* ── Brand palette ────────────────────────────────────────── */
  colors: {
    brand: {
      primary: '#73ff00',       // green accent used in buttons, dates
      primaryHover: '#15ff00',  // hover state of primary
      accent: '#15ff00',        // vivid accent for playback UI
      accentHover: '#9eff43',   // hover state of accent
      accentDark: '#0f920f',    // darker accent variant
    },

    /* ── Dark mode ───────────────────────────────────────────── */
    dark: {
      bg: '#0a0a0a',
      bgElevated: '#141414',
      bgGlass: 'rgba(18, 18, 18, 0.92)',
      text: '#ffffff',
      textMuted: '#a1a1a1',
      textFaint: '#666666',
      border: '#222222',
      borderSubtle: 'rgba(255, 255, 255, 0.08)',
      shadow: 'rgba(0, 0, 0, 0.4)',
      cardHoverBg: '#222222',
      progressTrack: 'rgba(255, 255, 255, 0.1)',
      speedBtnBg: 'rgba(255, 255, 255, 0.08)',
      speedBtnBorder: 'rgba(255, 255, 255, 0.15)',
      speedBtnHoverBg: 'rgba(255, 255, 255, 0.15)',
    },

    /* ── Light mode ──────────────────────────────────────────── */
    light: {
      bg: '#ffffff',
      bgElevated: '#f5f5f5',
      bgGlass: 'rgba(255, 255, 255, 0.92)',
      text: '#1a1a1a',
      textMuted: '#666666',
      textFaint: '#999999',
      border: '#e5e5e5',
      borderSubtle: 'rgba(0, 0, 0, 0.1)',
      shadow: 'rgba(0, 0, 0, 0.12)',
      cardHoverBg: '#f0f0f0',
      progressTrack: 'rgba(0, 0, 0, 0.08)',
      speedBtnBg: 'rgba(0, 0, 0, 0.05)',
      speedBtnBorder: 'rgba(0, 0, 0, 0.15)',
      speedBtnHoverBg: 'rgba(0, 0, 0, 0.1)',
      accentDark: '#00c853',           // overrides brand accentDark for readability
    },

    /* ── Difficulty badges ───────────────────────────────────── */
    difficulty: {
      easy: {
        dark:  { bg: 'rgba(0, 230, 118, 0.2)', text: '#00e676' },
        light: { bg: 'rgba(0, 200, 83, 0.15)', text: '#00a152' },
      },
      moderate: {
        dark:  { bg: 'rgba(255, 171, 64, 0.2)', text: '#ffab40' },
        light: { bg: 'rgba(230, 126, 34, 0.12)', text: '#e65100' },
      },
      challenging: {
        dark:  { bg: 'rgba(255, 82, 82, 0.2)', text: '#ff5252' },
        light: { bg: 'rgba(211, 47, 47, 0.12)', text: '#c62828' },
      },
    },

    /* ── Map route colours ───────────────────────────────────── */
    route: {
      full: '#FFA200',
      animatedLine: '#888888',
      head: '#E64A19',
      gradientStart: '#006633',
      gradientEnd: '#E64A19',
      markDot: '#F57C00',
    },
  },

  /* ── Typography ────────────────────────────────────────────── */
  fonts: {
    family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif",
    mono: "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace",
  },

  /* ── Logo SVG paths ────────────────────────────────────────── */
  logo: {
    viewBox: '0 0 24 24',
    paths: [
      'M12 2L4 7V17L12 22L20 17V7L12 2Z',
      'M12 8L8 10.5V15.5L12 18L16 15.5V10.5L12 8Z',
    ],
    strokeWidth: 2,
  },

  /* ── Layout constants ──────────────────────────────────────── */
  layout: {
    maxWidth: '1400px',
    borderRadius: '14px',
    borderRadiusCard: '12px',
    borderRadiusBadge: '20px',
    borderRadiusBtn: '8px',
    zIndexOverlay: 1000,
    zIndexHeader: 100,
    spacingOverlayTop: '30px',
    spacingOverlayBottom: '36px',
  },

  /* ── Transitions ────────────────────────────────────────────── */
  transitions: {
    theme: 'background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease',
  },
};

export default tokens;
