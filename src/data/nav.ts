// Navigation — transcribed from the LIVE served header (tech-truth/header-truth.html),
// not from the WP menu admin. Labels, order, hrefs and the Android submenu are verbatim.
// The menu-item-* / page_item classes are WordPress's own and are carried through because
// the theme's stylesheet targets them; do not "clean" them.

export type NavChild = { label: string; href: string; classes: string };
export type NavItem = {
  label: string;
  href: string;
  classes: string;
  children?: NavChild[];
};

export const NAV: NavItem[] = [
  {
    label: 'Home',
    href: '/',
    classes:
      'menu-item menu-item-type-post_type menu-item-object-page menu-item-home current-menu-item page_item page-item-64 current_page_item menu-item-91',
  },
  {
    label: 'Case Studies',
    href: '/case-studies/',
    classes: 'menu-item menu-item-type-post_type menu-item-object-page menu-item-71',
  },
  {
    label: 'Android',
    href: '/category/android/',
    classes:
      'menu-item menu-item-type-taxonomy menu-item-object-category menu-item-has-children menu-item-92 has-submenu',
    children: [
      {
        label: 'Android Tutorials',
        href: '/category/android/android-tutorials/',
        classes: 'menu-item menu-item-type-custom menu-item-object-custom menu-item-172 menu-item--sub',
      },
    ],
  },
  {
    label: 'Web-Dev',
    href: '/category/web-dev/',
    classes: 'menu-item menu-item-type-taxonomy menu-item-object-category menu-item-93',
  },
  {
    label: 'Software',
    href: '/category/software/',
    classes: 'menu-item menu-item-type-taxonomy menu-item-object-category menu-item-94',
  },
  {
    label: 'About',
    href: '/about/',
    classes: 'menu-item menu-item-type-post_type menu-item-object-page menu-item-95',
  },
  {
    label: 'Tools',
    href: '/tools/',
    classes: 'menu-item menu-item-type-custom menu-item-object-custom menu-item-458',
  },
];

export const SITE = {
  name: 'gwillchijioke',
  title: 'tech.gwillchijioke.com - Android tutorials and web',
  description:
    'Android tutorials, web development and software guides from G-will Chijioke.',
};
