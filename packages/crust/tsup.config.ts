import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      vanilla: 'src/vanilla.ts',
      react: 'src/react.tsx'
    },
    format: ['esm'],
    dts: true,
    clean: true,
    minify: true,
    external: ['react']
  },
  {
    // CSS gets its own entry so dist/styles.css ships standalone,
    // without a side-effect import polluting the JS modules.
    entry: { styles: 'src/styles.css' },
    format: ['esm'],
    minify: true
  }
]);
