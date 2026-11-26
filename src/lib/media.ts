// Media/local-origin helpers.
//
// Captured WordPress URLs are absolute (`https://gwillchijioke.qzz.io/wp-content/...`).
// The port serves the same files from its own deploy base, so strip the CMS origin and
// run the remainder through url() — never hardcode the WordPress host.
import { url } from './url';

const ORIGIN = 'https://gwillchijioke.qzz.io';

/** `/wp-content/uploads/x.jpg` (or an absolute CMS URL) -> deployed, base-aware path. */
export function local(pathOrUrl: string): string {
  if (!pathOrUrl) return '';
  return url(pathOrUrl.replace(ORIGIN, ''));
}

/** Rewrite every URL inside a srcset attribute. `a.jpg 300w, b.jpg 1024w` */
export function localSrcset(srcset: string): string {
  if (!srcset) return '';
  return srcset
    .split(',')
    .map((part) => {
      const [u, ...rest] = part.trim().split(/\s+/);
      return [local(u), ...rest].join(' ');
    })
    .join(', ');
}
