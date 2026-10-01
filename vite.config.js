import { defineConfig } from 'vite';
import { resolve } from 'path';
import { cpSync, existsSync, readdirSync } from 'fs';
import { phoneLogPlugin } from './tools/phone-log-plugin.mjs';

// Vite only bundles files it can trace from module imports / known HTML
// attributes. Everything the AR pages fetch at runtime — GLB models,
// compiled .mind targets, the vendored MindAR build, JSON data — is invisible
// to it, so without this copy step the deployed site 404s on all of them.
function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      for (const dir of ['assets', 'data']) {
        const src = resolve(__dirname, dir);
        if (existsSync(src)) cpSync(src, resolve(outDir, dir), { recursive: true });
      }
      // Root-level runtime files (mascot GLBs for the selfie pages, marker patterns).
      for (const f of readdirSync(__dirname)) {
        if (f.endsWith('.glb') || f.endsWith('.patt')) {
          cpSync(resolve(__dirname, f), resolve(outDir, f));
        }
      }
      // GitHub Pages' not-found page. Copied, not built: its links are absolute
      // (/city-project/...) because it's served for arbitrary missing paths.
      cpSync(resolve(__dirname, '404.html'), resolve(outDir, '404.html'));
      console.log('✓ copied static assets (assets/, data/, root GLB/patt, 404.html) into dist/');
    }
  };
}

export default defineConfig({
  // Base public path when served in development or production.
  // We use relative paths './' because GitHub pages often serves from a subdirectory (e.g. username.github.io/repo-name)
  base: './',
  // phoneLogPlugin: dev/preview only — writes a phone's field log to logs/phone/ during `npm run phone`.
  plugins: [copyStaticAssets(), phoneLogPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        locationTour: resolve(__dirname, 'location-tour.html'),
        muralAr: resolve(__dirname, 'mural-ar.html'),
        selfieAr: resolve(__dirname, 'selfie-ar.html'),
        sharkAr8thwall: resolve(__dirname, 'shark-ar-8thwall.html'),
        sharkArDemo: resolve(__dirname, 'shark-ar-demo.html'),
        sharksWay: resolve(__dirname, 'sharks-way.html'),
        soccerAr8thwall: resolve(__dirname, 'soccer-ar-8thwall.html')
        // note: explicitly not including sharks-way-v0.html or debug-8thwall.html for now
      }
    }
  },
  // `npm run phone` serves this through a Cloudflare quick tunnel
  // (https://<random>.trycloudflare.com); Vite refuses unknown hostnames.
  server: {
    open: true,
    allowedHosts: ['.trycloudflare.com']
  },
  preview: {
    allowedHosts: ['.trycloudflare.com']
  }
});
