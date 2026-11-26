#!/usr/bin/env node
// Generate sitemap.xml + rss.xml from the captured post/page data.
// Runs as the FIRST step of `npm run build` so the feeds always match the pages built.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SITE = process.env.SITE_ORIGIN || 'https://godschi10.github.io';
const BASE = process.env.BASE_PATH || '/gwillchijioke-tech-astro';
const BASE_NORM = BASE.endsWith('/') ? BASE : BASE + '/';
const ORIGIN = new URL(BASE_NORM, SITE).href.replace(/\/$/, '');

const postsDir = 'src/data/posts';
const posts = readdirSync(postsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(`${postsDir}/${f}`, 'utf8')))
  .sort((a, b) => (a.slug < b.slug ? 1 : -1));

// Pages that exist as routes, in the live site's own URL shapes.
const STATIC_PATHS = [
  ['/', 1.0],
  ['/all-posts/', 0.9],
  ['/category/', 0.8],
  ['/author/gwill/', 0.7],
  ['/tools/', 0.9],
  ['/about/', 0.6],
  ['/start-here/', 0.7],
  ['/resources/', 0.7],
  ['/contact/', 0.6],
  ['/privacy-policy/', 0.3],
  ['/disclaimer/', 0.3],
];

const enc = (s) => encodeURI(s);
const abs = (p) => `${ORIGIN}${p === '/' ? '/' : p}`;

// ── sitemap ────────────────────────────────────────────────────────────────
const urls = [
  ...STATIC_PATHS.map(([p, pri]) => `  <url><loc>${abs(enc(p))}</loc><priority>${pri}</priority></url>`),
  ...posts.map((p) => `  <url><loc>${abs(enc(`/${p.slug}/`))}</loc><priority>0.8</priority></url>`),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

// ── rss ────────────────────────────────────────────────────────────────────
const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const items = posts
  .slice(0, 30)
  .map(
    (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${abs(enc(`/${p.slug}/`))}</link>
      <guid>${abs(enc(`/${p.slug}/`))}</guid>
      <description>${esc(p.description)}</description>
    </item>`
  )
  .join('\n');
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>tech.gwillchijioke.com</title>
    <link>${abs('/')}</link>
    <description>Android tutorials and web engineering, tested first.</description>
${items}
  </channel>
</rss>
`;

mkdirSync('public', { recursive: true });
writeFileSync('public/sitemap.xml', sitemap);
writeFileSync('public/rss.xml', rss);
console.log(`feeds: sitemap ${posts.length + STATIC_PATHS.length} urls, rss ${Math.min(posts.length, 30)} items -> ${ORIGIN}`);
