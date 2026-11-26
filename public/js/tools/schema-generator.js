/* ============================================================
   WordPress Schema / JSON-LD Generator (Gutenberg angle) - v1.19.85
   Pick a schema type -> fill fields -> get valid JSON-LD to drop
   into WordPress (<script type="application/ld+json">) via the
   theme's gwill_seo_echo() / wp_head, or a plugin. 100% client-side.

   The DIFFERENTIATOR is the per-type "Gutenberg / WP integration" note:
   which types Gutenberg/SEO plugins auto-generate vs. what you must add
   by hand, and exactly where to inject the JSON-LD. Scoped #sch-app,
   classes sch-*.
   ------------------------------------------------------------ */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var typeSel = $('sch-type'), fieldsEl = $('sch-fields'), outEl = $('sch-out'),
      noteEl = $('sch-note'), byteCount = $('sch-byteCount'),
      copyBtn = $('sch-copy'), dlBtn = $('sch-dl');

  var currentType = 'article';

  /* -------- type registry: fields + builder + gutenberg note -------- */
  // field types: text, textarea, url, number, date, list (multiline -> array),
  // select_options, nested (for FAQ/Product offers), rating
  var TYPES = {
    article: {
      label: 'Article', icon: '📄',
      fields: [
        { id: 'headline', label: 'Headline', type: 'text', ph: 'Your article title', req: 1 },
        { id: 'description', label: 'Description', type: 'textarea', ph: 'One or two sentence summary' },
        { id: 'author', label: 'Author name', type: 'text', ph: 'John Doe' },
        { id: 'publisher', label: 'Publisher name', type: 'text', ph: 'Your Site' },
        { id: 'datePublished', label: 'Date published', type: 'date' },
        { id: 'dateModified', label: 'Date modified', type: 'date' },
        { id: 'image', label: 'Image URL', type: 'url', ph: 'https://…/hero.jpg' },
        { id: 'mainEntityOfPage', label: 'Page URL (self)', type: 'url', ph: 'https://…/this-post/' }
      ],
      build: function (v) {
        return { '@type': 'Article', headline: v.headline, description: v.description || undefined,
          author: v.author ? { '@type': 'Person', name: v.author } : undefined,
          publisher: v.publisher ? { '@type': 'Organization', name: v.publisher } : undefined,
          datePublished: v.datePublished || undefined, dateModified: v.dateModified || undefined,
          image: v.image || undefined, mainEntityOfPage: v.mainEntityOfPage || undefined };
      },
      note: 'Gutenberg / WP: use the "Article" type when the post is a blog/news article. Most WP SEO plugins (Rank Math, Yoast, SEO Press) auto-output Article JSON-LD from the post title/author/date - this generator is for when you need to override or self-host it. Add via your theme\u2019s wp_head hook or a plugin.'
    },
    faq: {
      label: 'FAQPage', icon: '❓',
      fields: [
        { id: 'faqs', label: 'Questions (one per line: Question | Answer)', type: 'list', ph: 'What is WordPress? | WordPress is a CMS.\nHow do I install it? | Follow the docs.' }
      ],
      build: function (v) {
        var items = [];
        ((v.faqs || '').split('\n')).forEach(function (line) {
          var parts = line.split('|');
          if (parts.length >= 2 && parts[0].trim()) {
            items.push({ '@type': 'Question', name: parts[0].trim(), acceptedAnswer: { '@type': 'Answer', text: parts.slice(1).join('|').trim() } });
          }
        });
        return { '@type': 'FAQPage', mainEntity: items };
      },
      note: 'Gutenberg / WP: FAQ schema is best added with a FAQ block plugin (or the theme\u2019s JSON-LD hook). Note: Google now only shows FAQ rich results for authoritative government/health sites, and can apply it to the whole domain - so it\u2019s low-value for most blogs now. Every Q&A you list must be visible on the page (don\u2019t hide FAQ behind a tab).'
    },
    product: {
      label: 'Product', icon: '🛍',
      fields: [
        { id: 'name', label: 'Product name', type: 'text', ph: 'Optima Widget', req: 1 },
        { id: 'description', label: 'Description', type: 'textarea' },
        { id: 'image', label: 'Image URL', type: 'url' },
        { id: 'sku', label: 'SKU', type: 'text' },
        { id: 'brand', label: 'Brand', type: 'text' },
        { id: 'price', label: 'Price', type: 'number', ph: '49.99' },
        { id: 'priceCurrency', label: 'Currency', type: 'text', ph: 'USD / NGN' },
        { id: 'availability', label: 'Availability', type: 'select', opts: ['InStock','OutOfStock','PreOrder','Discontinued'] },
        { id: 'rating', label: 'Aggregate rating (0-5)', type: 'number', ph: '4.6' },
        { id: 'reviewCount', label: 'Review count', type: 'number', ph: '127' }
      ],
      build: function (v) {
        var o = { '@type': 'Product', name: v.name, description: v.description || undefined, image: v.image || undefined,
          sku: v.sku || undefined, brand: v.brand ? { '@type': 'Brand', name: v.brand } : undefined };
        if (v.price) o.offers = { '@type': 'Offer', price: v.price, priceCurrency: v.priceCurrency || 'USD', availability: 'https://schema.org/' + (v.availability || 'InStock') };
        if (v.rating) o.aggregateRating = { '@type': 'AggregateRating', ratingValue: v.rating, reviewCount: v.reviewCount || '1' };
        return o;
      },
      note: 'Gutenberg / WP: WooCommerce auto-emits Product + Offer schema for shop pages. Use this generator for a product you are NOT selling through WooCommerce (e.g. a landing page, affiliate product, or a custom post type). The price must be shown on the page or Google may flag it as misleading rich data.'
    },
    organization: {
      label: 'Organization', icon: '🏢',
      fields: [
        { id: 'name', label: 'Name', type: 'text', ph: 'Example Corp', req: 1 },
        { id: 'url', label: 'Website URL', type: 'url' },
        { id: 'logo', label: 'Logo URL', type: 'url' },
        { id: 'sameAs', label: 'Social profiles (one per line)', type: 'list', ph: 'https://twitter.com/…\nhttps://facebook.com/…' },
        { id: 'address', label: 'Street address', type: 'text' },
        { id: 'city', label: 'City', type: 'text' },
        { id: 'country', label: 'Country', type: 'text' }
      ],
      build: function (v) {
        var o = { '@type': 'Organization', name: v.name, url: v.url || undefined, logo: v.logo ? { '@type': 'ImageObject', url: v.logo } : undefined };
        if (v.sameAs) o.sameAs = v.sameAs.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        if (v.address || v.city || v.country) o.address = { '@type': 'PostalAddress', streetAddress: v.address || undefined, addressLocality: v.city || undefined, addressCountry: v.country || undefined };
        return o;
      },
      note: 'Gutenberg / WP: put Organization schema site-wide (Site Identity) so Google knows your entity. Best injected once in the theme (wp_head) rather than per-post. You can also point its sameAs links at your verified social profiles to strengthen Knowledge Panel chances.'
    },
    person: {
      label: 'Person', icon: '👤',
      fields: [
        { id: 'name', label: 'Name', type: 'text', ph: 'Jane Doe', req: 1 },
        { id: 'jobTitle', label: 'Job title', type: 'text', ph: 'Editor' },
        { id: 'url', label: 'URL', type: 'url' },
        { id: 'worksFor', label: 'Works for', type: 'text' },
        { id: 'sameAs', label: 'Social / author profiles (one per line)', type: 'list' }
      ],
      build: function (v) {
        var o = { '@type': 'Person', name: v.name, jobTitle: v.jobTitle || undefined, url: v.url || undefined,
          worksFor: v.worksFor ? { '@type': 'Organization', name: v.worksFor } : undefined };
        if (v.sameAs) o.sameAs = v.sameAs.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        return o;
      },
      note: 'Gutenberg / WP: Person schema pairs with Article/author pages - it tells Google who wrote content. If you have bylines, add a Person block to the author archive. Connect it to your article schema\u2019s author field for the strongest entity signal.'
    },
    localbusiness: {
      label: 'LocalBusiness', icon: '📍',
      fields: [
        { id: 'name', label: 'Name', type: 'text', ph: 'Café Central', req: 1 },
        { id: 'image', label: 'Image URL', type: 'url' },
        { id: 'streetAddress', label: 'Street address', type: 'text' },
        { id: 'city', label: 'City', type: 'text' },
        { id: 'postal', label: 'Postal code', type: 'text' },
        { id: 'phone', label: 'Phone', type: 'text', ph: '+1 555 000 1234' },
        { id: 'priceRange', label: 'Price range', type: 'text', ph: '$$' },
        { id: 'rating', label: 'Aggregate rating (0-5)', type: 'number' },
        { id: 'reviewCount', label: 'Review count', type: 'number' }
      ],
      build: function (v) {
        var o = { '@type': 'LocalBusiness', name: v.name, image: v.image || undefined, telephone: v.phone || undefined, priceRange: v.priceRange || undefined,
          address: { '@type': 'PostalAddress', streetAddress: v.streetAddress || undefined, addressLocality: v.city || undefined, postalCode: v.postal || undefined } };
        if (v.rating) o.aggregateRating = { '@type': 'AggregateRating', ratingValue: v.rating, reviewCount: v.reviewCount || '1' };
        return o;
      },
      note: 'Gutenberg / WP: LocalBusiness is usually managed by local-SEO plugins (Local SEO, Rank Math local). Review snippets from LocalBusiness rich results were deprecated by Google in 2023 - the structured data still helps local relevance, and Google Business Profile is the real driver for map/knowledge visibility.'
    },
    recipe: {
      label: 'Recipe', icon: '🍳',
      fields: [
        { id: 'name', label: 'Recipe name', type: 'text', ph: 'Jollof Rice', req: 1 },
        { id: 'author', label: 'Author', type: 'text' },
        { id: 'prepTime', label: 'Prep time (ISO)', type: 'text', ph: 'PT15M' },
        { id: 'cookTime', label: 'Cook time (ISO)', type: 'text', ph: 'PT30M' },
        { id: 'image', label: 'Image URL', type: 'url' },
        { id: 'ingredients', label: 'Ingredients (one per line)', type: 'list', ph: 'Rice\nTomato paste\nPepper' },
        { id: 'steps', label: 'Steps (one per line)', type: 'list', ph: 'Cook the rice.\nAdd the sauce.' }
      ],
      build: function (v) {
        var o = { '@type': 'Recipe', name: v.name, author: v.author ? { '@type': 'Person', name: v.author } : undefined,
          prepTime: v.prepTime || undefined, cookTime: v.cookTime || undefined, image: v.image || undefined,
          recipeIngredient: (v.ingredients || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean) };
        o.recipeInstructions = (v.steps || '').split('\n').filter(Boolean).map(function (s, i) { return { '@type': 'HowToStep', position: i + 1, name: s.trim() }; });
        return o;
      },
      note: 'Gutenberg / WP: Recipe rich results need the Recipe block or a recipe plugin (WP Recipe Maker, Tasty Recipes) that emits the schema as you write. This is one of the few types where hand-building is error-prone and a plugin genuinely helps, because you must include review/rating, time, and 4+ ingredients for rich eligibility.'
    },
    event: {
      label: 'Event', icon: '📅',
      fields: [
        { id: 'name', label: 'Event name', type: 'text', ph: 'Webinar', req: 1 },
        { id: 'startDate', label: 'Start date', type: 'date' },
        { id: 'endDate', label: 'End date', type: 'date' },
        { id: 'location', label: 'Location name', type: 'text', ph: 'Virtual / Venue' },
        { id: 'address', label: 'Address', type: 'text' },
        { id: 'image', label: 'Image URL', type: 'url' },
        { id: 'price', label: 'Price', type: 'text', ph: '0 / 25.00' },
        { id: 'url', label: 'Event page URL', type: 'url' }
      ],
      build: function (v) {
        var o = { '@type': 'Event', name: v.name, startDate: v.startDate || undefined, endDate: v.endDate || undefined,
          image: v.image || undefined, url: v.url || undefined };
        if (v.location || v.address) o.location = { '@type': 'Place', name: v.location || undefined, address: v.address ? { '@type': 'PostalAddress', streetAddress: v.address } : undefined };
        if (v.price) o.offers = { '@type': 'Offer', price: v.price, priceCurrency: 'USD', availability: 'https://schema.org/InStock' };
        return o;
      },
      note: 'Gutenberg / WP: Event rich results (the calendar card) are one of the highest-visibility types. Use an events plugin (The Events Calendar) for recurring events, or hand-add this to a single event landing page. Google requires the event to still be active and the price/URL on the page.'
    },
    video: {
      label: 'VideoObject', icon: '🎬',
      fields: [
        { id: 'name', label: 'Video title', type: 'text', ph: 'My video', req: 1 },
        { id: 'description', label: 'Description', type: 'textarea' },
        { id: 'thumbnail', label: 'Thumbnail URL', type: 'url' },
        { id: 'uploadDate', label: 'Upload date', type: 'date' },
        { id: 'embedUrl', label: 'Embed URL', type: 'url', ph: 'https://www.youtube.com/embed/…' },
        { id: 'duration', label: 'Duration (ISO)', type: 'text', ph: 'PT3M20S' }
      ],
      build: function (v) {
        return { '@type': 'VideoObject', name: v.name, description: v.description || undefined,
          thumbnailUrl: v.thumbnail || undefined, uploadDate: v.uploadDate || undefined,
          embedUrl: v.embedUrl || undefined, duration: v.duration || undefined };
      },
      note: 'Gutenberg / WP: self-hosted videos you upload to media get VIDEO rich results if you add VideoObject. If the video is on YouTube, you don\u2019t need this - YouTube + the VideoObject sitemap handle it. Only hand-add when you host the MP4 yourself and want the thumbnail/description card.'
    },
    breadcrumb: {
      label: 'BreadcrumbList', icon: '🥖',
      fields: [
        { id: 'crumbs', label: 'Breadcrumbs (one per line: name | URL)', type: 'list', ph: 'Home | https://…/\nBlog | https://…/blog/\nThis Post | https://…/this-post/' }
      ],
      build: function (v) {
        var items = [];
        ((v.crumbs || '').split('\n')).forEach(function (line) {
          var parts = line.split('|');
          if (parts.length >= 1 && parts[0].trim()) {
            items.push({ '@type': 'ListItem', position: items.length + 1, name: parts[0].trim(), item: (parts[1] || '').trim() || undefined });
          }
        });
        return { '@type': 'BreadcrumbList', itemListElement: items };
      },
      note: 'Gutenberg / WP: BreadcrumbList is the SAFEST, lowest-risk schema and many themes/SEO plugins auto-generate it from your menu. If your theme already shows a breadcrumb trail, you almost certainly already have BreadcrumbList - check your source before duplicating it. This tool is for when your theme does NOT emit one.'
    }
  };

  /* -------- render the type-specific form fields -------- */
  function renderFields() {
    var t = TYPES[currentType];
    var html = '';
    t.fields.forEach(function (f) {
      var req = f.req ? ' <span style="color:var(--red)">*</span>' : '';
      if (f.type === 'textarea') {
        html += '<label class="sch-field"><span class="sch-lbl">' + f.label + req + '</span><textarea class="sch-in" data-f="' + f.id + '" placeholder="' + (f.ph || '') + '"></textarea></label>';
      } else if (f.type === 'list') {
        html += '<label class="sch-field"><span class="sch-lbl">' + f.label + req + '<span class="sch-hint">(one per line)</span></span><textarea class="sch-in" data-f="' + f.id + '" placeholder="' + (f.ph || '') + '"></textarea></label>';
      } else if (f.type === 'select') {
        html += '<label class="sch-field"><span class="sch-lbl">' + f.label + req + '</span><select class="sch-in" data-f="' + f.id + '">' + f.opts.map(function (o) { return '<option value="' + o + '">' + o + '</option>'; }).join('') + '</select></label>';
      } else {
        var type = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'url' ? 'text' : 'text';
        var im = f.type === 'url' ? 'inputmode="url"' : '';
        html += '<label class="sch-field"><span class="sch-lbl">' + f.label + req + '</span><input class="sch-in" type="' + type + '" data-f="' + f.id + '" placeholder="' + (f.ph || '') + '" ' + im + '></label>';
      }
    });
    fieldsEl.innerHTML = html;
    // bind input -> live build
    Array.prototype.forEach.call(fieldsEl.querySelectorAll('.sch-in'), function (el) {
      el.addEventListener('input', build);
    });
    noteEl.textContent = t.note;
    build();
  }

  function collect() {
    var v = {};
    Array.prototype.forEach.call(fieldsEl.querySelectorAll('.sch-in'), function (el) {
      var f = el.getAttribute('data-f');
      v[f] = el.value;
    });
    return v;
  }

  /* -------- build JSON-LD -------- */
  function build() {
    var t = TYPES[currentType];
    var data = null;
    try { data = t.build(collect()); } catch (e) { data = null; }
    // JSON.stringify drops keys whose value is undefined, so the `x || undefined`
    // pattern in the builders yields clean, scaffolding-free output.
    var json = JSON.stringify({ '@context': 'https://schema.org', '@graph': [data] }, null, 2);
    outEl.textContent = json;
    window.__sch_text = json;
    byteCount.textContent = json.length + ' B';
    validate(json);
  }

  function validate(json) {
    var ok = false, err = '';
    try { var o = JSON.parse(json); ok = !!o['@graph'] && !!o['@graph'][0]; } catch (e) { err = e.message; }
    if (ok) { noteEl.classList.add('ok'); noteEl.classList.remove('warn'); }
    else { noteEl.classList.add('warn'); noteEl.classList.remove('ok'); }
  }

  /* -------- copy / download -------- */
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { flash(copyBtn, 'Copied ✓'); }, function () { fallbackCopy(t); });
    else fallbackCopy(t);
  }
  function fallbackCopy(t) {
    var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); flash(copyBtn, 'Copied ✓'); } catch (e) { flash(copyBtn, 'copy failed'); }
    document.body.removeChild(ta);
  }
  function flash(btn, label) { var old = btn.textContent; btn.textContent = label; setTimeout(function () { btn.textContent = old; }, 1400); }
  function download() {
    var blob = new Blob([window.__sch_text || ''], { type: 'application/ld+json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = 'schema.jsonld'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  }

  /* -------- events -------- */
  if (typeSel) typeSel.addEventListener('change', function () { currentType = typeSel.value; renderFields(); });
  if (copyBtn) copyBtn.addEventListener('click', function () { copyText(window.__sch_text || ''); });
  if (dlBtn) dlBtn.addEventListener('click', download);

  /* -------- init -------- */
  if (typeSel) currentType = typeSel.value;
  renderFields();
})();
