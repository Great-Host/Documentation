const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { Marked } = require('marked');
const hljs = require('highlight.js');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3010;
const DOCS_DIR = path.join(__dirname, 'docs');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SITE_NAME = 'GreatHost Docs';
const IS_PROD = process.env.NODE_ENV === 'production';

// Metadatos de cada categoría (carpeta dentro de docs/)
const CATEGORY_META = {
  VPS: { label: 'VPS', navLabel: 'VPS', icon: 'fa-server', description: 'Virtual private servers with dedicated resources and full control.' },
  GameServer: { label: 'Game Servers', navLabel: 'GameServer', icon: 'fa-gamepad', description: 'Gaming-optimized servers with the best performance.' },
  IDE: { label: 'Cloud IDE', navLabel: 'IDE', icon: 'fa-code', description: 'Develop from anywhere with our integrated cloud environments.' },
  Services: { label: 'Services', navLabel: 'Services', icon: 'fa-cogs', description: 'Complementary services to power up your project.' },
  Reseller: { label: 'Reseller', navLabel: 'Reseller', icon: 'fa-store', description: 'Sell game servers and VPS under your own brand, with your own store or API.' }
};
const CATEGORY_ORDER = ['VPS', 'GameServer', 'IDE', 'Services', 'Reseller'];

app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json());

// public/index.html era la antigua SPA: nunca debe servirse
app.get('/index.html', (req, res) => res.redirect(301, '/'));
app.use(express.static(PUBLIC_DIR, { index: false, maxAge: IS_PROD ? '7d' : 0 }));

// Utilidades
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "2. console.md" -> "console", "3a. Selling VPS.md" -> "selling-vps"
function docSlug(file) {
  return slugify(file.replace(/\.md$/, '').replace(/^\d+[a-z]?\.\s*/i, ''));
}

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function stripEmoji(s) {
  return String(s).replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

function plainText(md) {
  return md
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,.;:]$/, '') + '…';
}

// Primer párrafo de texto real del markdown, para la meta description
function extractDescription(md, fallback) {
  const blocks = md.split(/\r?\n\s*\r?\n/);
  for (const block of blocks) {
    const b = block.split('\n').filter(line => !/^\s*#/.test(line)).join('\n').trim();
    if (!b || /^(<|!\[|\||```|>|-{3,})/.test(b)) continue;
    const text = plainText(b.replace(/^\s*([-*]|\d+\.)\s+/gm, ''));
    if (text.length >= 40) return truncate(text, 158);
  }
  return fallback;
}

function getFileTitle(content, file) {
  const titleLine = content.split('\n').find(line => line.startsWith('# '));
  return titleLine ? titleLine.replace('# ', '').trim() : file.replace(/\.md$/, '');
}

function getBaseUrl(req) {
  return (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function assetVersion(file) {
  try {
    return fs.statSync(path.join(PUBLIC_DIR, file)).mtimeMs.toString(36);
  } catch (_) {
    return '1';
  }
}

const ASSET_VERSION = {
  css: assetVersion('styles.css'),
  js: assetVersion('script.js')
};

// Índice de documentación: categorías, documentos y sus URLs limpias
function buildIndex() {
  const categories = [];
  const byUrl = new Map();
  const byLegacy = new Map();

  const dirs = fs.readdirSync(DOCS_DIR)
    .filter(d => fs.statSync(path.join(DOCS_DIR, d)).isDirectory())
    .sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return naturalSort(a, b);
    });

  dirs.forEach(dir => {
    const meta = CATEGORY_META[dir] || { label: dir, navLabel: dir, icon: 'fa-book', description: `${dir} documentation.` };
    const slug = slugify(dir);
    const category = { dir, slug, url: `/${slug}`, ...meta, docs: [] };

    fs.readdirSync(path.join(DOCS_DIR, dir))
      .filter(f => f.endsWith('.md'))
      .sort(naturalSort)
      .forEach(file => {
        const fullPath = path.join(DOCS_DIR, dir, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        const rawTitle = getFileTitle(content, file);
        const title = stripEmoji(rawTitle) || rawTitle;
        const doc = {
          file,
          fullPath,
          category,
          slug: docSlug(file),
          url: `/${slug}/${docSlug(file)}`,
          title,
          description: extractDescription(content, `${title} – ${meta.label} documentation for GreatHost.`),
          content,
          mtime: fs.statSync(fullPath).mtime
        };
        category.docs.push(doc);
        byUrl.set(doc.url, doc);
        byLegacy.set(`${dir}/${file.replace(/\.md$/, '')}`.toLowerCase(), doc.url);
      });

    categories.push(category);
    byUrl.set(category.url, category);
    byLegacy.set(dir.toLowerCase(), category.url);
  });

  return { categories, byUrl, byLegacy };
}

let indexCache = null;
function getIndex() {
  if (!indexCache || !IS_PROD) indexCache = buildIndex();
  return indexCache;
}

function resolveLegacy(index, p) {
  let key = String(p);
  try {
    key = decodeURIComponent(key);
  } catch (_) {}
  return index.byLegacy.get(key.replace(/^[#/]+|\/+$/g, '').toLowerCase()) || null;
}

// Markdown -> HTML (resaltado de código e ids en los encabezados, en el servidor)
function renderMarkdown(md, index, doc) {
  const usedIds = new Map();
  const marked = new Marked({
    gfm: true,
    breaks: true,
    renderer: {
      heading(text, level, raw) {
        let id = slugify(raw) || 'section';
        const n = usedIds.get(id) || 0;
        usedIds.set(id, n + 1);
        if (n) id += `-${n}`;
        return `<h${level} id="${id}">${text}</h${level}>\n`;
      },
      code(code, infostring) {
        const lang = ((infostring || '').match(/^\S*/) || [''])[0];
        let highlighted;
        try {
          highlighted = lang && hljs.getLanguage(lang)
            ? hljs.highlight(code, { language: lang }).value
            : hljs.highlightAuto(code).value;
        } catch (_) {
          highlighted = escapeHtml(code);
        }
        return `<pre><code class="hljs${lang ? ` language-${escapeHtml(lang)}` : ''}">${highlighted}</code></pre>\n`;
      },
      link(href, title, text) {
        if (!href || !href.startsWith('/') || href.startsWith('/img/')) return false;
        const target = resolveLegacy(index, href.split('#')[0]);
        if (!target) return false;
        const hash = href.includes('#') ? '#' + href.split('#')[1] : '';
        return `<a href="${target}${hash}"${title ? ` title="${escapeHtml(title)}"` : ''}>${text}</a>`;
      }
    }
  });

  return marked.parse(md)
    .replace(/<img(?![^>]*\balt=)/g, `<img alt="${escapeHtml(doc.title)}"`)
    .replace(/<img(?![^>]*\bloading=)/g, '<img loading="lazy" decoding="async"');
}

// Plantillas
function jsonLdScript(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function breadcrumbLd(base, items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: base + item.url
    }))
  };
}

function breadcrumbHtml(items) {
  const parts = items.map((item, i) => i === items.length - 1
    ? `<span aria-current="page">${escapeHtml(item.name)}</span>`
    : `<a href="${item.url}">${escapeHtml(item.name)}</a>`);
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${parts.join(' <span class="breadcrumb-sep" aria-hidden="true">›</span> ')}</nav>`;
}

function sidebarHtml(index, currentUrl) {
  return index.categories.map(cat => {
    const links = cat.docs.map(doc => {
      const active = doc.url === currentUrl;
      return `<a class="nav-item-link${active ? ' active' : ''}" href="${doc.url}"${active ? ' aria-current="page"' : ''}>${escapeHtml(doc.title)}</a>`;
    }).join('');
    return `<div class="nav-category">
            <button type="button" class="nav-category-title" aria-expanded="true">
              <i class="fas fa-chevron-down" aria-hidden="true"></i>
              <span>${escapeHtml(cat.label)}</span>
            </button>
            <div class="nav-items">${links}</div>
          </div>`;
  }).join('\n          ');
}

function layoutHtml(req, { title, description, canonicalPath, body, currentUrl = '', activeCategory = '', noindex = false, ogType = 'website', jsonLd = [] }) {
  const index = getIndex();
  const base = getBaseUrl(req);
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `GreatHost Documentation – VPS, Game Servers, Cloud IDE & Reseller`;
  const canonical = canonicalPath != null ? base + canonicalPath : null;
  const mainNav = index.categories.map(cat =>
    `<a href="${cat.url}" class="nav-item${cat.slug === activeCategory ? ' active' : ''}"${cat.slug === activeCategory ? ' aria-current="true"' : ''}><i class="fas ${cat.icon}" aria-hidden="true"></i> ${escapeHtml(cat.navLabel)}</a>`
  ).join('\n        ');

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}">
  ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}
  <meta name="theme-color" content="#0f1419">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:title" content="${escapeHtml(title || 'GreatHost Documentation')}">
  <meta property="og:description" content="${escapeHtml(description)}">
  ${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : ''}
  <meta property="og:image" content="${base}/img/logo.png">
  <meta property="og:locale" content="en_US">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title || 'GreatHost Documentation')}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <link rel="icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/img/logo.png">
  <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION.css}">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css" id="hljs-theme">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script>
    (function () {
      var t = 'dark';
      try { t = localStorage.getItem('theme') || 'dark'; } catch (e) {}
      document.documentElement.setAttribute('data-theme', t);
      if (t === 'light') document.getElementById('hljs-theme').href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
    })();
  </script>
  ${jsonLd.map(jsonLdScript).join('\n  ')}
</head>
<body>
  <div class="app" id="app">
    <header class="header">
      <div class="header-left">
        <button type="button" class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle navigation" aria-controls="sidebar">
          <i class="fas fa-bars" aria-hidden="true"></i>
        </button>
        <a class="logo" href="/" aria-label="GreatHost Docs home">
          <img src="/img/logo.png" alt="GreatHost logo" width="32" height="32">
          <span>GreatHost</span>
        </a>
      </div>
      <nav class="main-nav" aria-label="Categories">
        ${mainNav}
      </nav>
      <div class="header-right">
        <form class="search-container" action="/search" method="get" role="search">
          <label for="searchInput" class="visually-hidden">Search documentation</label>
          <input type="search" id="searchInput" name="q" placeholder="Search documentation..." class="search-input" autocomplete="off" value="${escapeHtml((req.path === '/search' && req.query.q) || '')}">
          <button type="submit" class="search-btn" aria-label="Search">
            <i class="fas fa-search" aria-hidden="true"></i>
          </button>
          <div class="search-results" id="searchResults"></div>
        </form>
        <button type="button" class="theme-toggle" id="themeToggle" aria-label="Toggle light/dark theme">
          <i class="fas fa-sun" aria-hidden="true"></i>
        </button>
      </div>
    </header>
    <div class="main-container">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-content">
          <div class="sidebar-header"><p class="sidebar-title">Navigation</p></div>
          <nav class="sidebar-nav" id="sidebarNav" aria-label="Documentation">
          ${sidebarHtml(index, currentUrl)}
          </nav>
        </div>
      </aside>
      <main class="content" id="content">
        <div class="content-wrapper">
          ${body}
        </div>
      </main>
    </div>
  </div>
  <script src="/script.js?v=${ASSET_VERSION.js}" defer></script>
</body>
</html>`;
}

function sendPage(res, html, status = 200) {
  res.status(status)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', IS_PROD ? 'public, max-age=300' : 'no-cache')
    .send(html);
}

function organizationLd(base) {
  return {
    '@type': 'Organization',
    name: 'GreatHost',
    url: 'https://greathost.es',
    logo: `${base}/img/logo.png`
  };
}

// Páginas
function homePage(req) {
  const index = getIndex();
  const base = getBaseUrl(req);
  const cards = index.categories.map(cat => `
        <a class="feature-card" href="${cat.url}">
          <div class="feature-icon"><i class="fas ${cat.icon}" aria-hidden="true"></i></div>
          <h2>${escapeHtml(cat.label)}</h2>
          <p>${escapeHtml(cat.description)}</p>
        </a>`).join('');
  const popular = index.categories.map(cat => cat.docs[0]).filter(Boolean).map(doc =>
    `<li><a href="${doc.url}">${escapeHtml(doc.title)}</a> <span class="muted">– ${escapeHtml(doc.category.label)}</span></li>`
  ).join('');

  const body = `
  <div class="welcome-screen">
    <div class="welcome-content">
      <h1><i class="fas fa-rocket" aria-hidden="true"></i> GreatHost Documentation</h1>
      <p class="welcome-subtitle">Guides and tutorials for your complete hosting platform: VPS, game servers, cloud IDE and the reseller programme.</p>
      <div class="features-grid">${cards}
      </div>
      <div class="quick-start">
        <h2>Quick Start</h2>
        <p>Pick a category above, use the sidebar or start with one of these guides:</p>
        <ul class="quick-links">${popular}</ul>
      </div>
    </div>
  </div>`;

  return layoutHtml(req, {
    title: '',
    description: 'Official GreatHost documentation: step-by-step guides for VPS, game servers, Pterodactyl, SFTP, backups, the cloud IDE and the reseller programme and API.',
    canonicalPath: '/',
    body,
    jsonLd: [{
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          name: SITE_NAME,
          url: `${base}/`,
          inLanguage: 'en',
          publisher: organizationLd(base),
          potentialAction: {
            '@type': 'SearchAction',
            target: { '@type': 'EntryPoint', urlTemplate: `${base}/search?q={search_term_string}` },
            'query-input': 'required name=search_term_string'
          }
        },
        organizationLd(base)
      ]
    }]
  });
}

function categoryPage(req, cat) {
  const base = getBaseUrl(req);
  const crumbs = [{ name: 'Home', url: '/' }, { name: cat.label, url: cat.url }];
  const list = cat.docs.map(doc => `
        <li>
          <a href="${doc.url}">${escapeHtml(doc.title)}</a>
          <p>${escapeHtml(doc.description)}</p>
        </li>`).join('');
  const body = `
  <div class="doc-content">
    ${breadcrumbHtml(crumbs)}
    <article class="article">
      <h1>${escapeHtml(cat.label)} documentation</h1>
      <p>${escapeHtml(cat.description)}</p>
      <ul class="doc-list">${list || '<li>No guides yet.</li>'}
      </ul>
    </article>
  </div>`;

  return layoutHtml(req, {
    title: `${cat.label} documentation`,
    description: truncate(`${cat.description} ${cat.docs.length} GreatHost guides: ${cat.docs.map(d => d.title).join(', ')}.`, 158),
    canonicalPath: cat.url,
    activeCategory: cat.slug,
    body,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `${cat.label} documentation`,
        description: cat.description,
        url: base + cat.url,
        inLanguage: 'en',
        hasPart: cat.docs.map(d => ({ '@type': 'TechArticle', headline: d.title, url: base + d.url }))
      },
      breadcrumbLd(base, crumbs)
    ]
  });
}

function docPage(req, doc) {
  const index = getIndex();
  const base = getBaseUrl(req);
  const cat = doc.category;
  const crumbs = [{ name: 'Home', url: '/' }, { name: cat.label, url: cat.url }, { name: doc.title, url: doc.url }];
  const i = cat.docs.indexOf(doc);
  const prev = cat.docs[i - 1];
  const next = cat.docs[i + 1];
  const pager = (prev || next) ? `
      <nav class="doc-pager" aria-label="Previous and next guides">
        <div>${prev ? `<a class="pager-link" href="${prev.url}" rel="prev">← Previous: ${escapeHtml(prev.title)}</a>` : ''}</div>
        <div>${next ? `<a class="pager-link" href="${next.url}" rel="next">Next: ${escapeHtml(next.title)} →</a>` : ''}</div>
      </nav>` : '';
  const updated = doc.mtime.toISOString();

  const body = `
  <div class="doc-content">
    ${breadcrumbHtml(crumbs)}
    <article class="article">
      ${renderMarkdown(doc.content, index, doc)}
      <p class="doc-updated">Last updated: <time datetime="${updated}">${updated.slice(0, 10)}</time></p>
      ${pager}
    </article>
  </div>`;

  return layoutHtml(req, {
    title: doc.title,
    description: doc.description,
    canonicalPath: doc.url,
    currentUrl: doc.url,
    activeCategory: cat.slug,
    ogType: 'article',
    body,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: doc.title,
        description: doc.description,
        url: base + doc.url,
        mainEntityOfPage: base + doc.url,
        dateModified: updated,
        inLanguage: 'en',
        articleSection: cat.label,
        image: `${base}/img/logo.png`,
        author: organizationLd(base),
        publisher: organizationLd(base)
      },
      breadcrumbLd(base, crumbs)
    ]
  });
}

function notFoundPage(req) {
  const body = `
  <div class="doc-content">
    <article class="article">
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist or has moved. Go back to the <a href="/">GreatHost documentation home</a> or use the search box.</p>
    </article>
  </div>`;
  return layoutHtml(req, { title: 'Page not found', description: 'This page could not be found in the GreatHost documentation.', canonicalPath: null, noindex: true, body });
}

// Búsqueda
function searchDocs(query) {
  const q = query.toLowerCase();
  const results = [];
  getIndex().categories.forEach(cat => cat.docs.forEach(doc => {
    const titleMatch = doc.title.toLowerCase().includes(q);
    const lines = doc.content.split('\n');
    const lineIndex = lines.findIndex(line => !line.startsWith('<') && line.toLowerCase().includes(q));
    if (!titleMatch && lineIndex === -1) return;
    results.push({
      url: doc.url,
      file: doc.url,
      title: doc.title,
      category: cat.label,
      line: lineIndex + 1,
      content: lineIndex === -1 ? doc.description : truncate(plainText(lines[lineIndex].replace(/^#+\s*/, '')), 160),
      score: titleMatch ? 2 : 1
    });
  }));
  return results.sort((a, b) => b.score - a.score);
}

// Rutas
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${getBaseUrl(req)}/sitemap.xml
`);
});

app.get('/sitemap.xml', (req, res) => {
  const base = getBaseUrl(req);
  const index = getIndex();
  const urls = [`  <url><loc>${base}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`];
  index.categories.forEach(cat => {
    const lastmod = cat.docs.reduce((max, d) => d.mtime > max ? d.mtime : max, new Date(0));
    urls.push(`  <url><loc>${base}${cat.url}</loc>${cat.docs.length ? `<lastmod>${lastmod.toISOString()}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.8</priority></url>`);
    cat.docs.forEach(doc => {
      urls.push(`  <url><loc>${base}${doc.url}</loc><lastmod>${doc.mtime.toISOString()}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`);
    });
  });
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`);
});

app.get('/api/navigation', (req, res) => {
  res.json(getIndex().categories.map(cat => ({
    name: cat.label,
    type: 'directory',
    path: cat.url,
    children: cat.docs.map(doc => ({ name: doc.title, type: 'file', path: doc.url }))
  })));
});

app.get('/api/search', (req, res) => {
  const query = (req.query.q || '').toString().trim();
  if (query.length < 2) return res.json([]);
  res.json(searchDocs(query).slice(0, 20));
});

// Enlaces antiguos con hash (#GameServer/2. console) -> URL limpia
app.get('/legacy', (req, res) => {
  const target = resolveLegacy(getIndex(), req.query.p || '');
  res.redirect(301, target || '/');
});

app.get('/', (req, res) => sendPage(res, homePage(req)));

app.get('/search', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const results = q.length >= 2 ? searchDocs(q).slice(0, 50) : [];
  const items = results.map(r => `
        <li>
          <a href="${r.url}">${escapeHtml(r.title)}</a> <span class="muted">– ${escapeHtml(r.category)}</span>
          <p>${escapeHtml(r.content)}</p>
        </li>`).join('');
  const body = `
  <div class="doc-content">
    <article class="article">
      <h1>${q ? `Search results for “${escapeHtml(q)}”` : 'Search the documentation'}</h1>
      ${q.length < 2 ? '<p>Type at least 2 characters in the search box.</p>' : `<ul class="doc-list">${items || '<li>No results found.</li>'}</ul>`}
    </article>
  </div>`;
  sendPage(res, layoutHtml(req, {
    title: q ? `Search: ${q}` : 'Search',
    description: 'Search the GreatHost documentation.',
    canonicalPath: '/search',
    noindex: true,
    body
  }));
});

app.get('*', (req, res) => {
  const index = getIndex();
  let reqPath;
  try {
    reqPath = decodeURIComponent(req.path);
  } catch (_) {
    return sendPage(res, notFoundPage(req), 404);
  }
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';

  const page = index.byUrl.get(reqPath);
  if (page) return sendPage(res, page.docs ? categoryPage(req, page) : docPage(req, page));

  // Variantes: barra final, mayúsculas o rutas antiguas ("/GameServer/2. console")
  const normalized = reqPath.replace(/\/+$/, '').toLowerCase();
  if (normalized && index.byUrl.has(normalized)) return res.redirect(301, normalized + query);
  const legacy = resolveLegacy(index, reqPath);
  if (legacy) return res.redirect(301, legacy + query);

  sendPage(res, notFoundPage(req), 404);
});

app.listen(PORT, () => {
  console.log(`\n🚀 GreatHost Documentation Server running on http://localhost:${PORT}\n`);

  try {
    const items = getIndex().categories.map(cat => `${cat.label} (${cat.url}, ${cat.docs.length} docs)`);

    if (items.length > 0) {
      const title = "📚 Available Categories";
      const maxLen = Math.max(title.length, ...items.map(i => i.length + 2));
      const width = maxLen + 4;

      console.log('┌' + '─'.repeat(width) + '┐');
      console.log('│ ' + title.padEnd(width - 1) + '│');
      console.log('├' + '─'.repeat(width) + '┤');

      items.forEach(item => {
        console.log('│ ' + (`• ${item}`).padEnd(width - 1) + '│');
      });

      console.log('└' + '─'.repeat(width) + '┘');
    }
  } catch (error) {
    console.log('   (Error listing categories)');
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
