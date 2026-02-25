import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

import tokens from './src/theme/tokens.js';
import { tokensToCSS } from './src/theme/tokensToCSS.js';

/** Treat .geojson files as JSON modules */
function geojsonPlugin() {
  return {
    name: 'vite-plugin-geojson',
    transform(src, id) {
      if (id.endsWith('.geojson')) {
        return {
          code: `export default ${src}`,
          map: null,
        };
      }
    },
  };
}

/**
 * Generate variables.css from tokens.js at build/dev time.
 *
 * Intercepts the load of `src/theme/variables.css` and returns CSS
 * custom properties derived from the design-tokens object, so that
 * tokens.js is the single source of truth for colours, fonts & layout.
 *
 * NOTE: changes to tokens.js require a dev-server restart to take effect.
 */
function cssTokensPlugin() {
  const generated = tokensToCSS(tokens);
  return {
    name: 'vite-plugin-css-tokens',
    enforce: 'pre',
    load(id) {
      if (id.replace(/\\/g, '/').endsWith('/theme/variables.css')) {
        return generated;
      }
    },
  };
}

export default defineConfig({
  plugins: [vue(), geojsonPlugin(), cssTokensPlugin()],
  base: process.env.NODE_ENV === 'production' ? '/acapulco/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
