// ═══════════════════════════════════════════
// MENU — Navegación premium responsive
//
// UNA sola fuente de verdad (MENU_ITEMS) que se renderiza en:
//   • Sidebar fijo a la izquierda (desktop ≥768px)
//   • Drawer lateral derecho con hamburguesa (mobile <768px)
//
// Cada click llama a showPanel(key) — las claves internas
// (agenda, cal, fichas, caja, precios) NO se tocan.
//
// Para agregar un nuevo item, sumar UN objeto a MENU_ITEMS:
// se renderiza automáticamente en el sidebar y en el drawer.
// ═══════════════════════════════════════════

var MENU_ITEMS = [
  { key: 'agenda',  label: 'Turnos',             icon: '📅' },
  { key: 'cal',     label: 'Calendario',         icon: '🗓' },
  { key: 'fichas',  label: 'Historias Clínicas', icon: '👤' },
  { key: 'caja',    label: 'Caja',               icon: '💰' },
  { key: 'precios', label: 'Precios',            icon: '💎' }
];

var _menuInitialized = false;

function _menuEls() {
  return {
    btn:     document.getElementById('menu-toggle'),
    panel:   document.getElementById('menu-panel'),
    overlay: document.getElementById('menu-overlay'),
    list:    document.getElementById('menu-list'),
    close:   document.getElementById('menu-close'),
    user:    document.getElementById('menu-footer-user')
  };
}

function _sidebarEls() {
  return {
    nav:  document.getElementById('aurea-sidebar-nav'),
    user: document.getElementById('aurea-sidebar-user')
  };
}

// ── Drawer mobile ─────────────────────────────────────────
function _renderMenuItems() {
  var els = _menuEls();
  if (!els.list) return;
  els.list.innerHTML = '';
  MENU_ITEMS.forEach(function(it) {
    var li = document.createElement('li');
    li.setAttribute('role', 'none');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-item';
    btn.id = 'menu-item-' + it.key;
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('data-key', it.key);
    btn.innerHTML =
      '<span class="menu-item-icon" aria-hidden="true">' + it.icon + '</span>' +
      '<span class="menu-item-label">' + it.label + '</span>';
    btn.addEventListener('click', function() {
      try { showPanel(it.key); } catch(e) {}
      closeMenu();
    });
    li.appendChild(btn);
    els.list.appendChild(li);
  });
}

// ── Sidebar desktop ───────────────────────────────────────
function _renderSidebarItems() {
  var els = _sidebarEls();
  if (!els.nav) return;
  els.nav.innerHTML = '';
  MENU_ITEMS.forEach(function(it) {
    var li = document.createElement('li');
    li.setAttribute('role', 'none');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'aurea-sidebar-item';
    btn.id = 'aurea-sidebar-item-' + it.key;
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('data-key', it.key);
    btn.innerHTML =
      '<span class="aurea-sidebar-item-icon" aria-hidden="true">' + it.icon + '</span>' +
      '<span class="aurea-sidebar-item-label">' + it.label + '</span>';
    btn.addEventListener('click', function() {
      try { showPanel(it.key); } catch(e) {}
      // En desktop el sidebar es estático: NO cerramos nada.
    });
    li.appendChild(btn);
    els.nav.appendChild(li);
  });
}

function _refreshSidebarUser() {
  var els = _sidebarEls();
  if (!els.user) return;
  if (typeof usuarioActual !== 'undefined' && usuarioActual) {
    var nombre = usuarioActual.nombre || '';
    var rol    = usuarioActual.rol ? ' · ' + usuarioActual.rol : '';
    els.user.textContent = nombre + rol;
  } else {
    els.user.textContent = '';
  }
}

// ── Sync de item activo (drawer + sidebar a la vez) ──────
function _syncActiveItem() {
  // Detectar el panel activo mirando los .panel.active del DOM, así no
  // dependemos de un estado paralelo.
  var activeKey = null;
  MENU_ITEMS.forEach(function(it) {
    var p = document.getElementById('panel-' + it.key);
    if (p && p.classList.contains('active')) activeKey = it.key;
  });
  MENU_ITEMS.forEach(function(it) {
    var drawerEl  = document.getElementById('menu-item-' + it.key);
    var sidebarEl = document.getElementById('aurea-sidebar-item-' + it.key);
    if (drawerEl) {
      if (it.key === activeKey) drawerEl.classList.add('active');
      else drawerEl.classList.remove('active');
    }
    if (sidebarEl) {
      if (it.key === activeKey) sidebarEl.classList.add('active');
      else sidebarEl.classList.remove('active');
    }
  });
}

function openMenu() {
  var els = _menuEls();
  if (!els.panel || !els.overlay) return;
  _syncActiveItem();
  // Refrescar usuario en el footer
  if (els.user && typeof usuarioActual !== 'undefined' && usuarioActual) {
    var nombre = usuarioActual.nombre || '';
    var rol    = usuarioActual.rol ? ' · ' + usuarioActual.rol : '';
    els.user.textContent = nombre + rol;
  }
  els.panel.classList.add('visible');
  els.overlay.classList.add('visible');
  els.panel.setAttribute('aria-hidden', 'false');
  els.overlay.setAttribute('aria-hidden', 'false');
  if (els.btn) {
    els.btn.classList.add('is-open');
    els.btn.setAttribute('aria-expanded', 'true');
    els.btn.setAttribute('aria-label', 'Cerrar menú');
  }
  document.body.classList.add('menu-open');
}

function closeMenu() {
  var els = _menuEls();
  if (!els.panel || !els.overlay) return;
  els.panel.classList.remove('visible');
  els.overlay.classList.remove('visible');
  els.panel.setAttribute('aria-hidden', 'true');
  els.overlay.setAttribute('aria-hidden', 'true');
  if (els.btn) {
    els.btn.classList.remove('is-open');
    els.btn.setAttribute('aria-expanded', 'false');
    els.btn.setAttribute('aria-label', 'Abrir menú');
  }
  document.body.classList.remove('menu-open');
}

function toggleMenu() {
  var p = document.getElementById('menu-panel');
  if (!p) return;
  if (p.classList.contains('visible')) closeMenu();
  else openMenu();
}

function initMenu() {
  if (_menuInitialized) return;
  var els = _menuEls();
  if (!els.btn || !els.panel || !els.overlay || !els.list) return;

  // Render unificado: drawer mobile + sidebar desktop, misma fuente
  _renderMenuItems();
  _renderSidebarItems();
  _refreshSidebarUser();
  _syncActiveItem();

  els.btn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleMenu();
  });
  if (els.close) els.close.addEventListener('click', closeMenu);
  els.overlay.addEventListener('click', closeMenu);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && els.panel.classList.contains('visible')) closeMenu();
  });

  // Mantener el item activo en sync cuando otra parte del código llama
  // showPanel() (por ej., el calendario que vuelve a la lista).
  // El sync ahora actualiza tanto el drawer como el sidebar.
  if (typeof showPanel === 'function' && !showPanel.__menuPatched) {
    var _orig = showPanel;
    window.showPanel = function(p) {
      var r = _orig.apply(this, arguments);
      try { _syncActiveItem(); } catch(e) {}
      try { _refreshSidebarUser(); } catch(e) {}
      return r;
    };
    window.showPanel.__menuPatched = true;
  }

  // Después del login (_entrarApp) refrescamos el footer del sidebar
  // para que muestre "Mariano · admin" sin esperar a una navegación.
  if (typeof _entrarApp === 'function' && !_entrarApp.__menuPatched) {
    var _origEntrar = _entrarApp;
    window._entrarApp = function() {
      var r = _origEntrar.apply(this, arguments);
      try { _refreshSidebarUser(); } catch(e) {}
      try { _syncActiveItem(); } catch(e) {}
      return r;
    };
    window._entrarApp.__menuPatched = true;
  }

  _menuInitialized = true;
}

// Auto-init: el botón vive dentro de #app-screen, que arranca con
// display:none. Inicializamos cuando el DOM ya tiene los nodos
// (al final del orden de scripts).
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMenu);
} else {
  initMenu();
}
