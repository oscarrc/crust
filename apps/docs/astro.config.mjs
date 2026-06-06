import { defineConfig, fontProviders } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  site: 'https://oscarrc.github.io',
  base: '/crust',
  vite: {
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [tailwindcss()]
  },
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Young Serif',
      cssVariable: '--font-young-serif',
      weights: [400],
      styles: ['normal'],
      fallbacks: ['serif']
    },
    {
      provider: fontProviders.google(),
      name: 'Hanken Grotesk',
      cssVariable: '--font-hanken',
      weights: [400, 500, 600],
      styles: ['normal', 'italic'],
      fallbacks: ['sans-serif']
    },
    {
      provider: fontProviders.google(),
      name: 'Fragment Mono',
      cssVariable: '--font-fragment-mono',
      weights: [400],
      styles: ['normal'],
      fallbacks: ['monospace']
    }
  ]
});
