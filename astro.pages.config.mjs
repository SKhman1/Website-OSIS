import { defineConfig } from 'astro/config';
import { redirects } from './config/redirects.mjs';

// Pages serves prerendered HTML; its functions/ directory owns the API.
// Keep this output separate from the local Node server build.
export default defineConfig({
  output: 'static',
  redirects,
  outDir: './dist-pages',
  devToolbar: { enabled: false },
});
