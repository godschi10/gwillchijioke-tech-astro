// Base-path URL helper.
//
// GitHub Pages project sites are served from a subpath (/gwill-tech-astro/), so a bare
// href="/about/" points at the USER site root and 404s. `import.meta.env.BASE_URL` carries
// NO trailing slash (Astro contract) — normalize once, here, and nowhere else.
const RAW = import.meta.env.BASE_URL || '/';
export const BASE = RAW.endsWith('/') ? RAW : RAW + '/';
// %BASE% replaces an origin WITHOUT a trailing slash (captures were `href="https://host/x/"` ->
// `href="%BASE%/x/"`), so substituting BASE (which ends in /) produced `//x/`. Use BASE_NS.
export const BASE_NS = BASE.replace(/\/$/, '');

/** Prefix a site-root-relative path with the deploy base. `url('/about/')` -> `/gwill-tech-astro/about/` */
export function url(path: string): string {
  if (!path) return BASE;
  if (/^[a-z]+:\/\//i.test(path) || path.startsWith('//') || path.startsWith('#')) return path;
  return BASE + (path.startsWith('/') ? path.slice(1) : path);
}

/** Absolute URL for canonical / og:image / sitemap. */
export function absUrl(path: string, site: URL | undefined): string {
  if (/^[a-z]+:\/\//i.test(path)) return path;
  return new URL(url(path), site ?? 'https://godschi10.github.io').href;
}
