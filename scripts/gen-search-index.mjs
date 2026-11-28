#!/usr/bin/env node
/**
 * Build the static search corpus for the header dropdown and /search/ page.
 *
 * One JSON file, fetched once per session. Contains every post, static page and
 * tool with plain text only — no HTML, no remote origin. URLs are already
 * base-aware so the same file works on localhost and GitHub Pages.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SITE = process.env.SITE_ORIGIN || 'https://godschi10.github.io';
const BASE_RAW = process.env.BASE_PATH || '/gwillchijioke-tech-astro';
const BASE = '/' + BASE_RAW.replace(/^\/|\/$/g, '') + '/';
const ORIGIN = new URL(BASE, SITE).href.replace(/\/$/, '');

const decode = (s = '') =>
  String(s)
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8216;|&lsquo;/g, '‘')
    .replace(/&#8220;|&ldquo;/g, '“')
    .replace(/&#8221;|&rdquo;/g, '”')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const list = (dir) => readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
const strip = (html = '') => decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
const pathFromCanonical = (canonical) => {
  try {
    const p = new URL(canonical).pathname.replace(/\/?$/, '/');
    return `${BASE}${p.replace(/^\//, '')}`;
  } catch {
    return null;
  }
};

const HIDDEN = /^(test(?:-\d+)?$|tested-and-working|pagination-playground|qa-mode-test)/i;

const posts = list('src/data/posts')
  .filter((p) => !HIDDEN.test(String(p.slug || '')) && !HIDDEN.test(String(p.title || '')))
  .map((p) => {
  const header = p.fragments?.header || '';
  const badge = header.match(/<span[^>]*class="[^"]*badge[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  const date = header.match(/itemprop="datePublished" content="([^"]+)"/i)?.[1] || header.match(/<time[^>]*datetime="([^"]+)"/i)?.[1] || '';
  const cls = String(p.articleClass || '');
  const catSlug = cls.match(/category-([a-z0-9-]+)/i)?.[1] || '';
  const bodyText = strip(p.fragments?.body || '').slice(0, 6000);
  return {
    id: `post:${p.slug}`,
    title: decode(p.title),
    url: `${BASE}${p.slug.replace(/^\//, '')}/`,
    excerpt: decode(p.description || strip(p.fragments?.body || '').slice(0, 180)),
    text: bodyText,
    cat: badge ? decode(badge[1]) : 'Article',
    cat_slug: catSlug,
    date,
    type: 'post',
  };
});

const HIDDEN_PAGE = new Set(['search', 'notfound', 'all-posts', 'category-index', 'author-gwill', 'tag-android']);

const pages = list('src/data/pages')
  .filter((p) => p.canonical && !HIDDEN_PAGE.has(p.name) && !/\/search\/?$/.test(p.canonical))
  .map((p) => {
    const url = pathFromCanonical(p.canonical);
    if (!url) return null;
    return {
      id: `page:${p.name || url}`,
      title: decode(p.title || ''),
      url,
      excerpt: decode(p.description || ''),
      text: strip(p.body || '').slice(0, 5000),
      cat: 'Page',
      cat_slug: 'page',
      date: '',
      type: 'page',
    };
  })
  .filter(Boolean);

const tools = list('src/data/tools').map((t) => ({
  id: `tool:${t.slug}`,
  title: decode(t.title || t.slug),
  url: `${BASE}tools/${t.slug}/`,
  excerpt: decode(t.description || ''),
  text: strip(t.body || '').slice(0, 4000),
  cat: 'Tool',
  cat_slug: 'tool',
  date: '',
  type: 'tool',
}));

const seen = new Set();
const index = [...posts, ...pages, ...tools]
  .filter((item) => {
    if (!item || !item.title || !item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  })
  .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title));

mkdirSync('public', { recursive: true });
writeFileSync('public/search-index.json', JSON.stringify(index));
console.log(`search index: ${index.length} items (${posts.length} posts, ${pages.length} pages, ${tools.length} tools) -> ${ORIGIN}/search-index.json`);
