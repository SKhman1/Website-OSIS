import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import { redirects } from './config/redirects.mjs';

export default defineConfig({
  output: 'static',
  redirects,
  adapter: node({ mode: 'standalone' }),
  integrations: [{
    name: 'osis-local-api',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => injectRoute({
        pattern: '/api/aspirasi',
        entrypoint: './src/server/routes/aspirasi.ts',
        prerender: false,
      }),
    },
  }],
  devToolbar: { enabled: false },
});
