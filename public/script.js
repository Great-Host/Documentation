// El contenido se renderiza en el servidor; este script solo añade mejoras de interfaz.
(function () {
  const root = document.documentElement;
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const themeToggle = document.getElementById('themeToggle');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const HLJS = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/';
  let searchTimeout = null;

  // Enlaces antiguos con hash (#GameServer/2. console) -> URL limpia
  const hash = decodeURIComponent(window.location.hash.slice(1));
  if (hash && window.location.pathname === '/' && !document.getElementById(hash)) {
    window.location.replace('/legacy?p=' + encodeURIComponent(hash));
    return;
  }

  // Tema
  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch (_) {}
    themeToggle.querySelector('i').className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    document.getElementById('hljs-theme').href = HLJS + (theme === 'light' ? 'github.min.css' : 'github-dark.min.css');
  }

  applyTheme(root.getAttribute('data-theme') || 'dark');
  themeToggle.addEventListener('click', () => {
    applyTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
  });

  // Sidebar
  const isMobile = () => window.innerWidth <= 768;

  sidebarToggle.addEventListener('click', () => {
    if (isMobile()) {
      sidebar.classList.toggle('open');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });

  document.addEventListener('click', (e) => {
    if (isMobile() && sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });

  document.querySelectorAll('.nav-category-title').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.closest('.nav-category');
      category.classList.toggle('collapsed');
      btn.setAttribute('aria-expanded', String(!category.classList.contains('collapsed')));
    });
  });

  const active = sidebar.querySelector('.nav-item-link.active');
  if (active) active.scrollIntoView({ block: 'nearest' });

  // Búsqueda en vivo (el formulario funciona igual sin JS vía /search)
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function performSearch(query) {
    try {
      const response = await fetch('/api/search?q=' + encodeURIComponent(query));
      const results = await response.json();
      searchResults.innerHTML = results.length === 0
        ? '<div class="search-result-item">No results found</div>'
        : results.map(r => `
          <a class="search-result-item" href="${escapeHtml(r.url)}">
            <span class="search-result-title">${escapeHtml(r.title)}</span>
            <span class="search-result-content">${escapeHtml(r.content)}</span>
            <span class="search-result-path">${escapeHtml(r.category)}</span>
          </a>`).join('');
      searchResults.style.display = 'block';
    } catch (error) {
      console.error('Error en búsqueda:', error);
    }
  }

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    clearTimeout(searchTimeout);
    if (query.length < 2) {
      searchResults.style.display = 'none';
      return;
    }
    searchTimeout = setTimeout(() => performSearch(query), 300);
  });

  searchInput.addEventListener('focus', () => {
    if (searchResults.innerHTML.trim()) searchResults.style.display = 'block';
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      searchResults.style.display = 'none';
    }, 200);
  });
})();
