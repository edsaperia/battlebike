import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build` makes the normal site (used by GitHub Pages).
// `vite build --mode single` makes one self-contained HTML file in dist-single/.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 1500,
    // The single-file build is just the game; the site also gets the garage.
    rollupOptions: mode === 'single' ? {} : { input: ['index.html', 'garage.html'] },
  },
}));
