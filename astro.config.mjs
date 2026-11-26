// Astro config — GWill Tech (static port of the gwill-tech-theme WordPress theme)
//
// Hosting: GitHub Pages project site during production, i.e.
//   https://godschi10.github.io/gwillchijioke-tech-astro/
// so the build runs under BASE_PATH. At cutover to the real domain:
//   SITE_ORIGIN=https://gwillchijioke.qzz.io BASE_PATH=/ npm run build
// Every internal link goes through src/lib/url.ts so the base is never hardcoded.
import { defineConfig } from 'astro/config';

const SITE = process.env.SITE_ORIGIN || 'https://godschi10.github.io';
const BASE = process.env.BASE_PATH || '/gwillchijioke-tech-astro';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'always',
  build: { assetsInlineLimit: 4096 },
  compressHTML: false, // keep markup shape comparable to the WP capture
});
