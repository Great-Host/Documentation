// Estado de la aplicación
const AppState = {
  currentTheme: localStorage.getItem('theme') || 'dark',
  sidebarOpen: window.innerWidth > 768,
  currentPath: '',
  navigation: [],
  searchTimeout: null
};

// Elementos del DOM
const elements = {
  app: document.getElementById('app'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  sidebar: document.getElementById('sidebar'),
  sidebarNav: document.getElementById('sidebarNav'),
  themeToggle: document.getElementById('themeToggle'),
  searchInput: document.getElementById('searchInput'),
  searchResults: document.getElementById('searchResults'),
  welcomeScreen: document.getElementById('welcomeScreen'),
  docContent: document.getElementById('docContent'),
  breadcrumb: document.getElementById('breadcrumb'),
  article: document.getElementById('article'),
  loading: document.getElementById('loading'),
  mainNavItems: document.querySelectorAll('.nav-item'),
  featureCards: document.querySelectorAll('.feature-card')
};

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

function initializeApp() {
  // Aplicar tema guardado
  applyTheme(AppState.currentTheme);
  
  // Configurar event listeners
  setupEventListeners();
  
  // Cargar navegación
  loadNavigation();
  
  // Manejar URL inicial
  handleInitialRoute();
}

function setupEventListeners() {
  // Toggle sidebar
  elements.sidebarToggle.addEventListener('click', toggleSidebar);
  
  // Toggle tema
  elements.themeToggle.addEventListener('click', toggleTheme);
  
  // Búsqueda
  elements.searchInput.addEventListener('input', handleSearch);
  elements.searchInput.addEventListener('focus', showSearchResults);
  elements.searchInput.addEventListener('blur', hideSearchResults);
  
  // Navegación principal
  elements.mainNavItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const category = item.dataset.category;
      navigateToCategory(category);
    });
  });
  
  // Feature cards
  elements.featureCards.forEach(card => {
    card.addEventListener('click', () => {
      const category = card.dataset.category;
      navigateToCategory(category);
    });
  });
  
  // Cerrar sidebar en móvil al hacer click fuera
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && 
        AppState.sidebarOpen && 
        !elements.sidebar.contains(e.target) && 
        !elements.sidebarToggle.contains(e.target)) {
      closeSidebar();
    }
  });
  
  // Responsive
  window.addEventListener('resize', handleResize);
  
  // Navegación del navegador
  window.addEventListener('popstate', handlePopState);
}

// Gestión del tema
function toggleTheme() {
  const newTheme = AppState.currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
}

function applyTheme(theme) {
  AppState.currentTheme = theme;
  elements.app.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  
  // Actualizar icono del botón
  const icon = elements.themeToggle.querySelector('i');
  icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
  
  // Actualizar tema de highlight.js
  const hljsTheme = document.getElementById('hljs-theme');
  const themeUrl = theme === 'light' 
    ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css'
    : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
  hljsTheme.href = themeUrl;
}

// Gestión del sidebar
function toggleSidebar() {
  if (AppState.sidebarOpen) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

function openSidebar() {
  AppState.sidebarOpen = true;
  elements.sidebar.classList.remove('collapsed');
  elements.sidebar.classList.add('open');
}

function closeSidebar() {
  AppState.sidebarOpen = false;
  elements.sidebar.classList.add('collapsed');
  elements.sidebar.classList.remove('open');
}

function handleResize() {
  if (window.innerWidth > 768) {
    openSidebar();
  } else {
    closeSidebar();
  }
}

// Carga de navegación
async function loadNavigation() {
  try {
    showLoading();
    const response = await fetch('/api/navigation');
    const navigation = await response.json();
    AppState.navigation = navigation;
    renderNavigation(navigation);
  } catch (error) {
    console.error('Error loading navigation:', error);
    showError('Error loading navigation');
  } finally {
    hideLoading();
  }
}

function renderNavigation(navigation) {
  elements.sidebarNav.innerHTML = '';
  
  navigation.forEach(category => {
    const categoryElement = createCategoryElement(category);
    elements.sidebarNav.appendChild(categoryElement);
  });
}

function createCategoryElement(category) {
  const categoryDiv = document.createElement('div');
  categoryDiv.className = 'nav-category';
  
  const titleDiv = document.createElement('div');
  titleDiv.className = 'nav-category-title';
  titleDiv.innerHTML = `
    <i class="fas fa-chevron-down"></i>
    <span>${category.name}</span>
  `;
  
  const itemsDiv = document.createElement('div');
  itemsDiv.className = 'nav-items';
  
  if (category.children && category.children.length > 0) {
    category.children.forEach(item => {
      if (item.type === 'file') {
        const link = document.createElement('a');
        link.className = 'nav-item-link';
        link.href = `#${item.path}`;
        link.textContent = item.name;
        link.addEventListener('click', (e) => {
          e.preventDefault();
          navigateToDoc(item.path);
        });
        itemsDiv.appendChild(link);
      }
    });
  }
  
  // Toggle categoría
  titleDiv.addEventListener('click', () => {
    categoryDiv.classList.toggle('collapsed');
  });
  
  categoryDiv.appendChild(titleDiv);
  categoryDiv.appendChild(itemsDiv);
  
  return categoryDiv;
}

// Navegación
function navigateToCategory(category) {
  // Actualizar navegación activa
  elements.mainNavItems.forEach(item => {
    item.classList.remove('active');
    if (item.dataset.category === category) {
      item.classList.add('active');
    }
  });
  
  // Buscar el primer documento de la categoría
  const categoryData = AppState.navigation.find(nav => nav.name === category);
  if (categoryData && categoryData.children && categoryData.children.length > 0) {
    const firstDoc = categoryData.children.find(child => child.type === 'file');
    if (firstDoc) {
      navigateToDoc(firstDoc.path);
    }
  }
}

async function navigateToDoc(path) {
  try {
    showLoading();
    
    const response = await fetch(`/api/content/${path}`);
    if (!response.ok) {
      throw new Error('Document not found');
    }
    
    const data = await response.json();
    
    // Actualizar estado
    AppState.currentPath = path;
    
    // Actualizar URL
    history.pushState({ path }, data.title, `#${path}`);
    
    // Mostrar contenido
    showDocContent(data);
    
    // Actualizar navegación activa
    updateActiveNavigation(path);
    
    // Cerrar sidebar en móvil
    if (window.innerWidth <= 768) {
      closeSidebar();
    }
    
  } catch (error) {
    console.error('Error cargando documento:', error);
    showError('Error loading document');
  } finally {
    hideLoading();
  }
}

function showDocContent(data) {
  // Ocultar pantalla de bienvenida
  elements.welcomeScreen.style.display = 'none';
  elements.docContent.style.display = 'block';
  
  // Actualizar breadcrumb
  updateBreadcrumb(data.path);
  
  // Actualizar contenido
  elements.article.innerHTML = data.content;
  elements.article.classList.add('fade-in');
 
  normalizeInternalLinks();
 
  insertPrevNextControls();
  
  // Scroll al top
  elements.article.scrollTop = 0;
  
  // Re-highlight código
  if (window.hljs) {
    elements.article.querySelectorAll('pre code').forEach(block => {
      hljs.highlightElement(block);
    });
  }
}

function updateBreadcrumb(path) {
  const parts = path.split('/');
  let breadcrumbHTML = '<a href="#" onclick="showWelcome()">Home</a>';
  
  let currentPath = '';
  parts.forEach((part, index) => {
    currentPath += (index > 0 ? '/' : '') + part;
    if (index === parts.length - 1) {
      breadcrumbHTML += ` > <span>${part}</span>`;
    } else {
      breadcrumbHTML += ` > <a href="#${currentPath}" onclick="navigateToDoc('${currentPath}')">${part}</a>`;
    }
  });
  
  elements.breadcrumb.innerHTML = breadcrumbHTML;
}

function updateActiveNavigation(path) {
  // Remover active de todos los links
  elements.sidebarNav.querySelectorAll('.nav-item-link').forEach(link => {
    link.classList.remove('active');
  });
  
  // Agregar active al link actual
  const activeLink = elements.sidebarNav.querySelector(`a[href="#${path}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
    
    // Expandir categoría padre
    const category = activeLink.closest('.nav-category');
    if (category) {
      category.classList.remove('collapsed');
    }
  }
}

function normalizeInternalLinks() {
  elements.article.querySelectorAll('a[href^="/"]').forEach(a => {
    try {
      const url = new URL(a.getAttribute('href'), window.location.origin);
      const path = url.pathname.replace(/^\/+/, '');
      if (path && !path.startsWith('http')) {
        a.setAttribute('href', `#${path}`);
        a.addEventListener('click', (e) => {
          e.preventDefault();
          navigateToDoc(path);
        });
      }
    } catch (_) {
    }
  });
  
  elements.article.querySelectorAll('p').forEach(p => {
    const text = p.textContent || '';
    if (text.includes('Previous:') || text.includes('Next:')) {
      p.remove();
    }
  });
}

function insertPrevNextControls() {
  const path = AppState.currentPath;
  if (!path) return;
  
  const [category] = path.split('/');
  const cat = AppState.navigation.find(n => n.name === category);
  if (!cat || !cat.children) return;
  
  const files = cat.children.filter(c => c.type === 'file');
  const index = files.findIndex(f => f.path === path);
  if (index === -1) return;
  
  const prev = index > 0 ? files[index - 1] : null;
  const next = index < files.length - 1 ? files[index + 1] : null;
  
  const navDiv = document.createElement('div');
  navDiv.style.cssText = `
    display:flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 24px;
  `;
  
  const btnStyle = `
    display:inline-block;
    padding: 10px 20px;
    background-color: var(--accent-color, #1E3A8A);
    color: white;
    font-weight: bold;
    text-decoration: none;
    border-radius: 6px;
    font-size: 14px;
  `;
  
  const left = document.createElement('div');
  const right = document.createElement('div');
  
  if (prev) {
    const a = document.createElement('a');
    a.href = `#${prev.path}`;
    a.style.cssText = btnStyle;
    a.textContent = `← Previous: ${prev.name}`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToDoc(prev.path);
    });
    left.appendChild(a);
  }
  
  if (next) {
    const a = document.createElement('a');
    a.href = `#${next.path}`;
    a.style.cssText = btnStyle;
    a.textContent = `Next: ${next.name} →`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToDoc(next.path);
    });
    right.appendChild(a);
  }
  
  navDiv.appendChild(left);
  navDiv.appendChild(right);
  elements.article.appendChild(navDiv);
}

function showWelcome() {
  elements.docContent.style.display = 'none';
  elements.welcomeScreen.style.display = 'block';
  
  // Limpiar navegación activa
  elements.mainNavItems.forEach(item => item.classList.remove('active'));
  elements.sidebarNav.querySelectorAll('.nav-item-link').forEach(link => {
    link.classList.remove('active');
  });
  
  // Actualizar URL
  history.pushState({}, 'GreatHost - Documentation', '#');
  AppState.currentPath = '';
}

// Búsqueda
function handleSearch(e) {
  const query = e.target.value.trim();
  
  // Limpiar timeout anterior
  if (AppState.searchTimeout) {
    clearTimeout(AppState.searchTimeout);
  }
  
  if (query.length < 2) {
    hideSearchResults();
    return;
  }
  
  // Debounce la búsqueda
  AppState.searchTimeout = setTimeout(() => {
    performSearch(query);
  }, 300);
}

async function performSearch(query) {
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const results = await response.json();
    displaySearchResults(results);
  } catch (error) {
    console.error('Error en búsqueda:', error);
  }
}

function displaySearchResults(results) {
  if (results.length === 0) {
    elements.searchResults.innerHTML = '<div class="search-result-item">No results found</div>';
  } else {
    elements.searchResults.innerHTML = results.map(result => `
      <div class="search-result-item" onclick="navigateToDoc('${result.file}')">
        <div class="search-result-title">${result.title}</div>
        <div class="search-result-content">${result.content}</div>
        <div class="search-result-path">${result.file} (línea ${result.line})</div>
      </div>
    `).join('');
  }
  
  showSearchResults();
}

function showSearchResults() {
  elements.searchResults.style.display = 'block';
}

function hideSearchResults() {
  setTimeout(() => {
    elements.searchResults.style.display = 'none';
  }, 200);
}

// Manejo de rutas
function handleInitialRoute() {
  const hash = window.location.hash.slice(1);
  if (hash) {
    navigateToDoc(hash);
  } else {
    showWelcome();
  }
}

function handlePopState(e) {
  if (e.state && e.state.path) {
    navigateToDoc(e.state.path);
  } else {
    showWelcome();
  }
}

// Utilidades
function showLoading() {
  elements.loading.style.display = 'flex';
}

function hideLoading() {
  elements.loading.style.display = 'none';
}

function showError(message) {
  // Crear notificación de error
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-notification';
  errorDiv.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background-color: var(--danger-color);
    color: white;
    padding: 1rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px var(--shadow);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  errorDiv.textContent = message;
  
  document.body.appendChild(errorDiv);
  
  // Remover después de 5 segundos
  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

// Funciones globales para uso en HTML
window.navigateToDoc = navigateToDoc;
window.showWelcome = showWelcome;

// Cargar highlight.js si está disponible
if (typeof hljs !== 'undefined') {
  hljs.configure({
    languages: ['javascript', 'python', 'bash', 'html', 'css', 'json', 'yaml', 'sql']
  });
}

console.log('🚀 GreatHost Documentation App started successfully');
console.log('📱 Available features:');
console.log('   - Automatic navigation by categories');
console.log('   - Real-time search');
console.log('   - Light/dark theme');
console.log('   - Responsive design');
console.log('   - Syntax highlighting');
