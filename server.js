const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { marked } = require('marked');
const hljs = require('highlight.js');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3010;

marked.setOptions({
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (err) {}
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true
});

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getDirectoryStructure(dirPath, basePath = '') {
  const items = [];
  
  try {
    const files = fs.readdirSync(dirPath).sort((a, b) => {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    
    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      const relativePath = path.join(basePath, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        const children = getDirectoryStructure(fullPath, relativePath);
        items.push({
          name: file,
          type: 'directory',
          path: relativePath.replace(/\\/g, '/'),
          children: children
        });
      } else if (file.endsWith('.md')) {
        const name = file.replace('.md', '');
        items.push({
          name: name,
          type: 'file',
          path: relativePath.replace(/\\/g, '/').replace('.md', '')
        });
      }
    });
  } catch (error) {
    console.error('Error reading directory:', error);
  }
  
  return items;
}

function searchInFiles(query, dirPath = './docs') {
  const results = [];
  
  function searchRecursive(currentPath) {
    try {
      const files = fs.readdirSync(currentPath);
      
      files.forEach(file => {
        const fullPath = path.join(currentPath, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          searchRecursive(fullPath);
        } else if (file.endsWith('.md')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          
          lines.forEach((line, index) => {
            if (line.toLowerCase().includes(query.toLowerCase())) {
              const relativePath = path.relative('./docs', fullPath)
                .replace(/\\/g, '/')
                .replace('.md', '');
              
              results.push({
                file: relativePath,
                line: index + 1,
                content: line.trim(),
                title: getFileTitle(fullPath)
              });
            }
          });
        }
      });
    } catch (error) {
      console.error('Error searching files:', error);
    }
  }
  
  searchRecursive(dirPath);
  return results;
}

function getFileTitle(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const titleLine = lines.find(line => line.startsWith('# '));
    return titleLine ? titleLine.replace('# ', '') : path.basename(filePath, '.md');
  } catch (error) {
    return path.basename(filePath, '.md');
  }
}

function buildNavHtml(structure, base = '') {
  let html = '<ul>';
  structure.forEach(item => {
    if (item.type === 'directory') {
      html += `<li><span>${escapeHtml(item.name)}</span>`;
      html += buildNavHtml(item.children, item.path);
      html += '</li>';
    } else if (item.type === 'file') {
      html += `<li><a href="#${encodeURI(item.path)}">${escapeHtml(item.name)}</a></li>`;
    }
  });
  html += '</ul>';
  return html;
}

function layoutHtml({ title, sidebar, body }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - GreatHost Documentation</title>
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css" id="hljs-theme">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body>
  <div class="app" id="app">
    <header class="header">
      <div class="header-left">
        <button class="sidebar-toggle" id="sidebarToggle">
          <i class="fas fa-bars"></i>
        </button>
        <div class="logo">
          <img src="/img/logo.png" alt="GreatHost Logo">
          <span>GreatHost</span>
        </div>
      </div>
      <nav class="main-nav">
        <a href="#VPS" class="nav-item" data-category="VPS"><i class="fas fa-server"></i> VPS</a>
        <a href="#GameServer" class="nav-item" data-category="GameServer"><i class="fas fa-gamepad"></i> GameServer</a>
        <a href="#IDE" class="nav-item" data-category="IDE"><i class="fas fa-code"></i> IDE</a>
        <a href="#Services" class="nav-item" data-category="Services"><i class="fas fa-cogs"></i> Services</a>
      </nav>
      <div class="header-right">
        <div class="search-container">
          <input type="text" id="searchInput" placeholder="Search documentation..." class="search-input">
          <button class="search-btn">
              <i class="fas fa-search"></i>
          </button>
          <div class="search-results" id="searchResults"></div>
        </div>
        <button class="theme-toggle" id="themeToggle">
          <i class="fas fa-moon"></i>
        </button>
      </div>
    </header>
    <div class="main-container">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-content">
          <div class="sidebar-header"><h3>Navigation</h3></div>
          <nav class="sidebar-nav" id="sidebarNav">${sidebar}</nav>
        </div>
      </aside>
      <main class="content" id="content">
        <div class="content-wrapper">
          ${body}
        </div>
      </main>
    </div>
  </div>
  <div class="loading" id="loading">
    <div class="spinner"></div>
    <p>Loading...</p>
  </div>
  <script src="/script.js"></script>
</body>
</html>`;
}

function welcomeHtml() {
  return `
  <div class="welcome-screen" id="welcomeScreen">
    <div class="welcome-content">
      <h1><i class="fas fa-rocket"></i> Welcome to GreatHost</h1>
      <p class="welcome-subtitle">Your complete hosting platform</p>
      <div class="features-grid">
        <a class="feature-card" href="#VPS" data-category="VPS">
          <div class="feature-icon"><i class="fas fa-server"></i></div>
          <h3>VPS</h3>
          <p>Virtual private servers with dedicated resources and full control</p>
        </a>
        <a class="feature-card" href="#GameServer" data-category="GameServer">
          <div class="feature-icon"><i class="fas fa-gamepad"></i></div>
          <h3>Game Servers</h3>
          <p>Gaming-optimized servers with the best performance</p>
        </a>
        <a class="feature-card" href="#IDE" data-category="IDE">
          <div class="feature-icon"><i class="fas fa-code"></i></div>
          <h3>Cloud IDE</h3>
          <p>Develop from anywhere with our integrated environments</p>
        </a>
        <a class="feature-card" href="#Services" data-category="Services">
          <div class="feature-icon"><i class="fas fa-cogs"></i></div>
          <h3>Servicios</h3>
          <p>Complementary services to power up your project</p>
        </a>
      </div>
      <div class="quick-start">
        <h2>Quick Start</h2>
        <p>Select a category or use the sidebar navigation to explore our documentation.</p>
      </div>
    </div>
  </div>`;
}

function categoryIndexHtml(categoryPath) {
  const dirFsPath = path.join('./docs', categoryPath);
  if (!fs.existsSync(dirFsPath) || !fs.statSync(dirFsPath).isDirectory()) return null;
  const entries = fs.readdirSync(dirFsPath).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const items = entries.filter(f => f.endsWith('.md') || fs.statSync(path.join(dirFsPath, f)).isDirectory());
  let list = '<ul>';
  items.forEach(f => {
    if (f.endsWith('.md')) {
      const p = path.join(categoryPath, f.replace(/\.md$/, '')).replace(/\\/g, '/');
      list += `<li><a href="#${encodeURI(p)}">${escapeHtml(f.replace(/\.md$/, ''))}</a></li>`;
    } else {
      const p = path.join(categoryPath, f).replace(/\\/g, '/');
      list += `<li><a href="#${encodeURI(p)}">${escapeHtml(f)}</a></li>`;
    }
  });
  list += '</ul>';
  return `<div class="doc-content"><div class="breadcrumb">${escapeHtml(categoryPath)}</div><article class="article"><h1>${escapeHtml(categoryPath)}</h1>${list}</article></div>`;
}

app.get('/api/navigation', (req, res) => {
  try {
    const structure = getDirectoryStructure('./docs');
    res.json(structure);
  } catch (error) {
    console.error('Error getting navigation:', error);
    res.status(500).json({ error: 'Error getting navigation' });
  }
});

app.get('/api/content/*', (req, res) => {
  try {
    const filePath = req.params[0];
    const fullPath = path.join('./docs', filePath + '.md');
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const content = fs.readFileSync(fullPath, 'utf8');
    const html = marked(content);
    const title = getFileTitle(fullPath);
    
    res.json({
      title: title,
      content: html,
      path: filePath
    });
  } catch (error) {
    console.error('Error getting content:', error);
    res.status(500).json({ error: 'Error getting content' });
  }
});

app.get('/api/search', (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.length < 2) {
      return res.json([]);
    }
    
    const results = searchInFiles(query);
    res.json(results.slice(0, 20));
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({ error: 'Search error' });
  }
});

app.get('/', (req, res) => {
  const structure = getDirectoryStructure('./docs');
  const sidebar = buildNavHtml(structure);
  const body = welcomeHtml();
  res.send(layoutHtml({ title: 'Inicio', sidebar, body }));
});

app.get('/search', (req, res) => {
  const q = (req.query.q || '').toString();
  const structure = getDirectoryStructure('./docs');
  const sidebar = buildNavHtml(structure);
  if (!q || q.length < 2) {
    const body = `<div class="doc-content"><article class="article"><h1>Buscar</h1><p>Introduce al menos 2 caracteres.</p></article></div>`;
    return res.send(layoutHtml({ title: 'Buscar', sidebar, body }));
  }
  const results = searchInFiles(q).slice(0, 50);
  const items = results.map(r => {
    const url = '#' + r.file;
    return `<li><a href="${encodeURI(url)}"><strong>${escapeHtml(r.title)}</strong></a><br><small>${escapeHtml(r.file)}:${r.line}</small><br><code>${escapeHtml(r.content)}</code></li>`;
  }).join('');
  const body = `<div class="doc-content"><article class="article"><h1>Resultados para "${escapeHtml(q)}"</h1><ul>${items || '<li>Sin resultados</li>'}</ul></article></div>`;
  res.send(layoutHtml({ title: `Buscar: ${q}`, sidebar, body }));
});

app.get('/*', (req, res, next) => {
  const reqPath = decodeURI(req.path.replace(/^\/+/, ''));
  if (!reqPath) return next();
  const fullFile = path.join('./docs', reqPath + '.md');
  const asDir = path.join('./docs', reqPath);
  const structure = getDirectoryStructure('./docs');
  const sidebar = buildNavHtml(structure);
  if (fs.existsSync(fullFile) && fs.statSync(fullFile).isFile()) {
    try {
      const content = fs.readFileSync(fullFile, 'utf8');
      const html = marked(content);
      const title = getFileTitle(fullFile);
      const body = `<div class="doc-content"><div class="breadcrumb">${escapeHtml(reqPath)}</div><article class="article">${html}</article></div>`;
      return res.send(layoutHtml({ title, sidebar, body }));
    } catch (e) {
      return res.status(500).send('Error rendering document');
    }
  }
  if (fs.existsSync(asDir) && fs.statSync(asDir).isDirectory()) {
    const body = categoryIndexHtml(reqPath);
    if (body) return res.send(layoutHtml({ title: reqPath, sidebar, body }));
  }
  res.status(404).send(layoutHtml({ title: '404', sidebar, body: `<div class="doc-content"><article class="article"><h1>404</h1><p>Contenido no encontrado.</p></article></div>` }));
});

app.listen(PORT, () => {
  console.log(`\n🚀 GreatHost Documentation Server running on http://localhost:${PORT}\n`);
  
  try {
    const docsPath = path.join(__dirname, 'docs');
    if (fs.existsSync(docsPath)) {
      const items = fs.readdirSync(docsPath).filter(item => {
        return fs.statSync(path.join(docsPath, item)).isDirectory();
      });

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
    }
  } catch (error) {
    console.log('   (Error listing categories)');
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
